/**
 * vote_on_pr tool
 * Approve, reject, or provide feedback on a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse, VoteType } from '../types.js';

/**
 * Input schema for vote_on_pr
 */
export const VoteOnPRSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  vote: z
    .number()
    .refine((v) => [-10, -5, 0, 5, 10].includes(v), {
      message: 'Vote must be one of: 10 (Approved), 5 (Approved with suggestions), 0 (No vote), -5 (Waiting for author), -10 (Rejected)',
    })
    .describe(
      'Vote value: 10=Approved, 5=Approved with suggestions, 0=No vote, -5=Waiting for author, -10=Rejected'
    ),
  comment: z.string().optional().describe('Optional comment to accompany the vote'),
});

export type VoteOnPRInput = z.infer<typeof VoteOnPRSchema>;

/**
 * Map vote number to description
 */
function getVoteDescription(vote: number): string {
  switch (vote) {
    case 10:
      return 'Approved';
    case 5:
      return 'Approved with suggestions';
    case 0:
      return 'No vote';
    case -5:
      return 'Waiting for author';
    case -10:
      return 'Rejected';
    default:
      return 'Unknown';
  }
}

/**
 * Vote on a pull request
 */
export async function voteOnPR(input: VoteOnPRInput): Promise<ToolResponse> {
  try {
    const params = VoteOnPRSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get current user first
    const pr = await gitApi.getPullRequest(repoId, params.prId, project);
    if (!pr) {
      return {
        success: false,
        error: {
          code: 'PR_NOT_FOUND',
          message: `Pull request #${params.prId} not found`,
        },
      };
    }

    // Get connection to find current user
    const { getClient } = await import('../client.js');
    const connection = getClient();
    const connectionData = await connection.connect();
    const currentUserId = connectionData.authenticatedUser?.id;

    if (!currentUserId) {
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Could not determine current user ID',
        },
      };
    }

    // Create reviewer vote
    const reviewerVote = {
      vote: params.vote as VoteType,
    };

    // Submit vote
    const reviewer = await gitApi.createPullRequestReviewer(
      reviewerVote,
      repoId,
      params.prId,
      currentUserId,
      project
    );

    // Add comment if provided
    let commentAdded = false;
    if (params.comment) {
      try {
        const thread = {
          comments: [
            {
              content: params.comment,
              commentType: 1, // Text comment
            },
          ],
          status: 1, // Active
        };

        await gitApi.createThread(thread, repoId, params.prId, project);
        commentAdded = true;
      } catch (error) {
        // Comment failed but vote succeeded - note in response
      }
    }

    // Get updated PR to check new state (refresh after vote)
    const updatedPR = await gitApi.getPullRequest(repoId, params.prId, project);
    const reviewers = updatedPR.reviewers || [];
    const approvals = reviewers.filter((r) => r.vote === 10).length;
    const rejections = reviewers.filter((r) => r.vote === -10).length;

    // Determine next steps based on vote and PR state
    const suggestedActions = [];

    if (params.vote === 10) {
      // Approved - check if ready to merge
      const requiredReviewers = reviewers.filter((r) => r.isRequired);
      const requiredApprovals = requiredReviewers.filter((r) => r.vote === 10).length;

      if (requiredApprovals >= requiredReviewers.length && updatedPR.mergeStatus === 3) {
        suggestedActions.push({
          tool: 'complete_pr',
          params: { prId: params.prId },
          reason: 'PR is approved and ready to merge',
          priority: 'high' as const,
        });
      } else {
        suggestedActions.push({
          tool: 'get_pr',
          params: { prId: params.prId, level: 'summary' },
          reason: 'Check if more approvals needed or if there are blockers',
          priority: 'medium' as const,
        });
      }
    } else if (params.vote === -10 || params.vote === -5) {
      // Rejected or waiting - suggest adding detailed feedback
      if (!params.comment) {
        suggestedActions.push({
          tool: 'add_comment',
          params: { prId: params.prId },
          reason: 'Add detailed feedback explaining the concerns',
          priority: 'high' as const,
        });
      }
    } else if (params.vote === 5) {
      // Approved with suggestions - suggest adding inline comments
      suggestedActions.push({
        tool: 'add_comment',
        params: { prId: params.prId },
        reason: 'Add inline comments for specific suggestions',
        priority: 'medium' as const,
      });
    }

    return {
      success: true,
      data: {
        vote: {
          value: params.vote,
          description: getVoteDescription(params.vote),
        },
        comment: params.comment
          ? {
              added: commentAdded,
              content: params.comment,
            }
          : null,
        prState: {
          id: params.prId,
          totalApprovals: approvals,
          totalRejections: rejections,
          status: updatedPR.isDraft ? 'draft' : 'active',
        },
        message: `Vote recorded: ${getVoteDescription(params.vote)}${
          params.comment && commentAdded ? ' with comment' : ''
        }`,
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'VOTE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to vote on pull request',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const voteOnPRTool = {
  name: 'vote_on_pr',
  description:
    'Vote on a pull request. Vote values: 10=Approved, 5=Approved with suggestions, 0=No vote (reset), -5=Waiting for author, -10=Rejected. Optionally include a comment. Returns updated PR state and suggested next actions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      vote: {
        type: 'number',
        enum: [-10, -5, 0, 5, 10],
        description:
          'Vote value: 10=Approved, 5=Approved with suggestions, 0=No vote, -5=Waiting for author, -10=Rejected',
      },
      comment: {
        type: 'string',
        description: 'Optional comment to accompany the vote',
      },
    },
    required: ['prId', 'vote'],
  },
};
