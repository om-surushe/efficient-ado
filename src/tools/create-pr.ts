/**
 * create_pr tool
 * Create a new pull request
 */

import { z } from 'zod';
import { getGitApi, getWorkItemApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for create_pr
 */
export const CreatePRSchema = z.object({
  sourceBranch: z
    .string()
    .describe('Source branch name (e.g., "feature/new-feature" or "refs/heads/feature/new-feature")'),
  targetBranch: z
    .string()
    .optional()
    .describe('Target branch name (defaults to repository default branch, e.g., "main" or "refs/heads/main")'),
  title: z.string().describe('Pull request title'),
  description: z.string().optional().describe('Pull request description (supports Markdown)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  isDraft: z.boolean().optional().default(false).describe('Create as draft PR'),
  autoComplete: z
    .boolean()
    .optional()
    .default(false)
    .describe('Enable auto-complete when all policies pass'),
  deleteSourceBranch: z
    .boolean()
    .optional()
    .default(false)
    .describe('Delete source branch after merge (requires autoComplete)'),
  workItemIds: z.array(z.number()).optional().describe('Work item IDs to link to this PR'),
  reviewers: z.array(z.string()).optional().describe('Reviewer email addresses or IDs to add'),
});

export type CreatePRInput = z.infer<typeof CreatePRSchema>;

/**
 * Create a pull request
 */
export async function createPr(input: CreatePRInput): Promise<ToolResponse> {
  try {
    const params = CreatePRSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Normalize branch refs
    const sourceRef = params.sourceBranch.startsWith('refs/heads/')
      ? params.sourceBranch
      : `refs/heads/${params.sourceBranch}`;

    let targetRef = params.targetBranch;

    // Get default branch if target not specified
    if (!targetRef) {
      const repo = await gitApi.getRepository(repoId, project);
      if (!repo.defaultBranch) {
        return {
          success: false,
          error: {
            code: 'NO_DEFAULT_BRANCH',
            message: `Repository ${repoId} has no default branch`,
          },
          details: {
              howToFix: 'Specify targetBranch explicitly, or use list_branches to see available branches',
            },
        };
      }
      targetRef = repo.defaultBranch;
    } else if (!targetRef.startsWith('refs/heads/')) {
      targetRef = `refs/heads/${targetRef}`;
    }

    // Create PR
    const pr = await gitApi.createPullRequest(
      {
        sourceRefName: sourceRef,
        targetRefName: targetRef,
        title: params.title,
        description: params.description,
        isDraft: params.isDraft,
      },
      repoId,
      project
    );

    if (!pr.pullRequestId) {
      return {
        success: false,
        error: {
          code: 'PR_CREATE_FAILED',
          message: 'PR created but no ID returned',
        },
      };
    }

    const prId = pr.pullRequestId;
    const partialFailures: Array<{ item: string; error: string }> = [];

    // Link work items if specified
    if (params.workItemIds && params.workItemIds.length > 0) {
      const witApi = await getWorkItemApi();
      const wiResults = await Promise.allSettled(
        params.workItemIds.map((workItemId) =>
          witApi.updateWorkItem(
            undefined,
            [
              {
                op: 'add',
                path: '/relations/-',
                value: {
                  rel: 'ArtifactLink',
                  url: `vstfs:///Git/PullRequestId/${project}%2F${pr.repository?.id}%2F${prId}`,
                  attributes: { name: 'Pull Request' },
                },
              },
            ],
            workItemId,
            project
          )
        )
      );
      wiResults.forEach((result, i) => {
        if (result.status === 'rejected') {
          partialFailures.push({
            item: `work item #${params.workItemIds![i]}`,
            error: result.reason instanceof Error ? result.reason.message : 'Failed to link',
          });
        }
      });
    }

    // Add reviewers if specified
    if (params.reviewers && params.reviewers.length > 0) {
      const rvResults = await Promise.allSettled(
        params.reviewers.map((reviewerId) =>
          gitApi.createPullRequestReviewer({ id: reviewerId }, repoId, prId, reviewerId, project)
        )
      );
      rvResults.forEach((result, i) => {
        if (result.status === 'rejected') {
          partialFailures.push({
            item: `reviewer ${params.reviewers![i]}`,
            error: result.reason instanceof Error ? result.reason.message : 'Failed to add',
          });
        }
      });
    }

    // Set auto-complete if requested
    if (params.autoComplete) {
      try {
        const { getClient } = await import('../client.js');
        const connection = getClient();
        const connectionData = await connection.connect();
        const currentUserId = connectionData.authenticatedUser?.id;

        if (currentUserId) {
          await gitApi.updatePullRequest(
            {
              autoCompleteSetBy: {
                id: currentUserId,
              },
              completionOptions: {
                deleteSourceBranch: params.deleteSourceBranch,
              },
            },
            repoId,
            prId,
            project
          );
        }
      } catch (error) {
        console.error('Failed to set auto-complete:', error);
      }
    }

    // Fetch the final PR state
    const finalPr = await gitApi.getPullRequest(repoId, prId, project);

    return {
      success: true,
      data: {
        id: finalPr.pullRequestId,
        title: finalPr.title,
        status: finalPr.status,
        isDraft: finalPr.isDraft,
        url: `https://dev.azure.com/${finalPr.repository?.project?.name}/_git/${finalPr.repository?.name}/pullrequest/${finalPr.pullRequestId}`,
        sourceBranch: finalPr.sourceRefName?.replace('refs/heads/', ''),
        targetBranch: finalPr.targetRefName?.replace('refs/heads/', ''),
        createdBy: finalPr.createdBy?.displayName,
        createdDate: finalPr.creationDate,
        hasAutoComplete: !!finalPr.autoCompleteSetBy,
        reviewers: finalPr.reviewers?.map((r) => ({
          name: r.displayName,
          vote: r.vote,
          isRequired: r.isRequired,
        })),
        ...(partialFailures.length > 0 && { partialFailures }),
        suggestedActions: [
          {
            tool: 'get_pr',
            params: { prId: finalPr.pullRequestId, level: 'summary' },
            reason: 'View the new PR',
            priority: 'high' as const,
          },
          {
            tool: 'add_comment',
            params: { prId: finalPr.pullRequestId },
            reason: 'Add a comment or description',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'CREATE_PR_FAILED',
        message: error.message || 'Failed to create PR',
        details: {
          howToFix: 'Verify source and target branches exist using list_branches',
        },
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const createPrTool = {
  name: 'create_pr',
  description:
    'Create a new pull request. Specify source and target branches, title, and optional description. Can set as draft, enable auto-complete, link work items, and add reviewers. Use this after pushing changes to a branch.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      sourceBranch: {
        type: 'string',
        description: 'Source branch name (e.g., "feature/new-feature" or "refs/heads/feature/new-feature")',
      },
      targetBranch: {
        type: 'string',
        description: 'Target branch name (defaults to repository default branch, e.g., "main")',
      },
      title: {
        type: 'string',
        description: 'Pull request title',
      },
      description: {
        type: 'string',
        description: 'Pull request description (supports Markdown)',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      isDraft: {
        type: 'boolean',
        description: 'Create as draft PR',
      },
      autoComplete: {
        type: 'boolean',
        description: 'Enable auto-complete when all policies pass',
      },
      deleteSourceBranch: {
        type: 'boolean',
        description: 'Delete source branch after merge (requires autoComplete)',
      },
      workItemIds: {
        type: 'array',
        items: {
          type: 'number',
        },
        description: 'Work item IDs to link to this PR',
      },
      reviewers: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Reviewer email addresses or IDs to add',
      },
    },
    required: ['sourceBranch', 'title'],
  },
};
