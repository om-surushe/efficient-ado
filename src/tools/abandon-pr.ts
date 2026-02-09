/**
 * abandon_pr tool
 * Abandon (close without merging) a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for abandon_pr
 */
export const AbandonPRSchema = z.object({
  prId: z.number().describe('Pull request ID to abandon'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  reason: z.string().optional().describe('Optional comment explaining why PR is being abandoned'),
});

export type AbandonPRInput = z.infer<typeof AbandonPRSchema>;

/**
 * Abandon a pull request
 */
export async function abandonPr(input: AbandonPRInput): Promise<ToolResponse> {
  try {
    const params = AbandonPRSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get current PR
    const currentPr = await gitApi.getPullRequest(repoId, params.prId, project);

    if (!currentPr) {
      return {
        success: false,
        error: {
          code: 'PR_NOT_FOUND',
          message: `Pull request #${params.prId} not found`,
        },
      };
    }

    // Check status
    if (currentPr.status === 2) {
      // Abandoned
      return {
        success: false,
        error: {
          code: 'ALREADY_ABANDONED',
          message: 'PR is already abandoned',
        },
        suggestedActions: ['Use reactivate_pr to reopen this PR', 'Use get_pr to check PR status'],
      };
    }

    if (currentPr.status === 3) {
      // Completed
      return {
        success: false,
        error: {
          code: 'ALREADY_COMPLETED',
          message: 'Cannot abandon a completed PR',
        },
        suggestedActions: ['PR is already merged/completed', 'Use get_pr to see PR details'],
      };
    }

    // Add comment if reason provided
    if (params.reason) {
      try {
        await gitApi.createThread(
          {
            comments: [
              {
                content: `PR abandoned: ${params.reason}`,
                commentType: 1,
              },
            ],
            status: 1,
          },
          repoId,
          params.prId,
          project
        );
      } catch (error) {
        console.error('Failed to add abandonment comment:', error);
      }
    }

    // Abandon PR (status 2 = Abandoned)
    const pr = await gitApi.updatePullRequest(
      {
        status: 2,
      },
      repoId,
      params.prId,
      project
    );

    return {
      success: true,
      data: {
        id: pr.pullRequestId,
        title: pr.title,
        status: 'abandoned',
        url: `https://dev.azure.com/${pr.repository?.project?.name}/_git/${pr.repository?.name}/pullrequest/${pr.pullRequestId}`,
        abandonedBy: pr.closedBy?.displayName,
        abandonedDate: pr.closedDate,
      },
      suggestedActions: ['Use reactivate_pr to reopen if needed', 'Use list_prs with status filter to see active PRs'],
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'ABANDON_PR_FAILED',
        message: error.message || 'Failed to abandon PR',
      },
      suggestedActions: ['Verify PR exists using get_pr', 'Check PR is in active state'],
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const abandonPrTool = {
  name: 'abandon_pr',
  description:
    'Abandon (close without merging) a pull request. Optionally provide a reason comment. Use this when PR is no longer needed or work is going in a different direction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID to abandon',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      reason: {
        type: 'string',
        description: 'Optional comment explaining why PR is being abandoned',
      },
    },
    required: ['prId'],
  },
};
