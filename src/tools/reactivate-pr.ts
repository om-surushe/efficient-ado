/**
 * reactivate_pr tool
 * Reactivate (reopen) an abandoned pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for reactivate_pr
 */
export const ReactivatePRSchema = z.object({
  prId: z.number().describe('Pull request ID to reactivate'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  comment: z.string().optional().describe('Optional comment explaining why PR is being reactivated'),
});

export type ReactivatePRInput = z.infer<typeof ReactivatePRSchema>;

/**
 * Reactivate a pull request
 */
export async function reactivatePr(input: ReactivatePRInput): Promise<ToolResponse> {
  try {
    const params = ReactivatePRSchema.parse(input);

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
    if (currentPr.status === 1) {
      // Active
      return {
        success: false,
        error: {
          code: 'ALREADY_ACTIVE',
          message: 'PR is already active',
        },
        suggestedActions: ['Use get_pr to see current PR state', 'Use start_review to begin reviewing'],
      };
    }

    if (currentPr.status === 3) {
      // Completed
      return {
        success: false,
        error: {
          code: 'CANNOT_REACTIVATE_COMPLETED',
          message: 'Cannot reactivate a completed (merged) PR',
        },
        suggestedActions: [
          'PR is already merged and cannot be reopened',
          'Create a new PR if you need to make more changes',
        ],
      };
    }

    if (currentPr.status !== 2) {
      // Not Abandoned
      return {
        success: false,
        error: {
          code: 'NOT_ABANDONED',
          message: `PR status is ${currentPr.status}, can only reactivate abandoned PRs`,
        },
        suggestedActions: ['Use get_pr to see current PR state'],
      };
    }

    // Add comment if provided
    if (params.comment) {
      try {
        await gitApi.createThread(
          {
            comments: [
              {
                content: `PR reactivated: ${params.comment}`,
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
        console.error('Failed to add reactivation comment:', error);
      }
    }

    // Reactivate PR (status 1 = Active)
    const pr = await gitApi.updatePullRequest(
      {
        status: 1,
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
        status: 'active',
        url: `https://dev.azure.com/${pr.repository?.project?.name}/_git/${pr.repository?.name}/pullrequest/${pr.pullRequestId}`,
        sourceBranch: pr.sourceRefName?.replace('refs/heads/', ''),
        targetBranch: pr.targetRefName?.replace('refs/heads/', ''),
        isDraft: pr.isDraft,
      },
      suggestedActions: [
        'Use start_review to begin reviewing',
        'Use get_pr to see full PR details',
        'Use check_merge_readiness to see if PR can be merged',
      ],
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'REACTIVATE_PR_FAILED',
        message: error.message || 'Failed to reactivate PR',
      },
      suggestedActions: ['Verify PR exists using get_pr', 'Check PR is abandoned'],
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const reactivatePrTool = {
  name: 'reactivate_pr',
  description:
    'Reactivate (reopen) an abandoned pull request. Optionally provide a comment explaining why. Use this when you want to resume work on an abandoned PR.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID to reactivate',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      comment: {
        type: 'string',
        description: 'Optional comment explaining why PR is being reactivated',
      },
    },
    required: ['prId'],
  },
};
