/**
 * manage_reviewers tool
 * Add or remove reviewers from a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';
import { IdentityRefWithVote } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

/**
 * Input schema for manage_reviewers
 */
export const ManageReviewersSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  addReviewers: z
    .array(
      z.object({
        id: z.string().describe('Reviewer user ID or email'),
        isRequired: z.boolean().optional().default(false).describe('Mark as required reviewer'),
      })
    )
    .optional()
    .describe('Reviewers to add'),
  removeReviewers: z
    .array(z.string())
    .optional()
    .describe('Reviewer IDs to remove'),
});

export type ManageReviewersInput = z.infer<typeof ManageReviewersSchema>;

/**
 * Manage reviewers on a pull request
 */
export async function manageReviewers(input: ManageReviewersInput): Promise<ToolResponse> {
  try {
    const params = ManageReviewersSchema.parse(input);

    if (!params.addReviewers && !params.removeReviewers) {
      return {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Must specify either addReviewers or removeReviewers',
        },
      };
    }

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    const results = {
      added: [] as Array<{ id: string; isRequired: boolean }>,
      removed: [] as string[],
      errors: [] as Array<{ id: string; error: string }>,
    };

    // Add reviewers
    if (params.addReviewers && params.addReviewers.length > 0) {
      for (const reviewer of params.addReviewers) {
        try {
          const reviewerData: IdentityRefWithVote = {
            id: reviewer.id,
            isRequired: reviewer.isRequired,
          };

          await gitApi.createPullRequestReviewer(
            reviewerData,
            repoId,
            params.prId,
            reviewer.id,
            project
          );

          results.added.push({
            id: reviewer.id,
            isRequired: reviewer.isRequired,
          });
        } catch (error) {
          results.errors.push({
            id: reviewer.id,
            error: error instanceof Error ? error.message : 'Failed to add reviewer',
          });
        }
      }
    }

    // Remove reviewers
    if (params.removeReviewers && params.removeReviewers.length > 0) {
      for (const reviewerId of params.removeReviewers) {
        try {
          await gitApi.deletePullRequestReviewer(
            repoId,
            params.prId,
            reviewerId,
            project
          );

          results.removed.push(reviewerId);
        } catch (error) {
          results.errors.push({
            id: reviewerId,
            error: error instanceof Error ? error.message : 'Failed to remove reviewer',
          });
        }
      }
    }

    // Get updated reviewer list
    const pr = await gitApi.getPullRequest(repoId, params.prId, project);
    const currentReviewers = pr.reviewers || [];

    const reviewerSummary = currentReviewers.map((r) => ({
      id: r.id || '',
      displayName: r.displayName || 'Unknown',
      isRequired: r.isRequired || false,
      vote: r.vote || 0,
      hasDeclined: r.hasDeclined || false,
    }));

    // Suggested actions
    const suggestedActions = [];

    const requiredReviewers = currentReviewers.filter((r) => r.isRequired);
    const requiredApprovals = requiredReviewers.filter((r) => r.vote === 10).length;

    if (requiredReviewers.length > requiredApprovals) {
      suggestedActions.push({
        tool: 'get_pr',
        params: { prId: params.prId, level: 'summary' },
        reason: `Waiting for ${requiredReviewers.length - requiredApprovals} required approval(s)`,
        priority: 'medium' as const,
      });
    }

    // If we added reviewers, suggest notifying them
    if (results.added.length > 0) {
      suggestedActions.push({
        tool: 'add_comment',
        params: {
          prId: params.prId,
          content: `@reviewers - requesting your review`,
        },
        reason: 'Notify new reviewers',
        priority: 'low' as const,
      });
    }

    return {
      success: true,
      data: {
        changes: {
          added: results.added.length,
          removed: results.removed.length,
          errors: results.errors.length,
        },
        details: results,
        currentReviewers: {
          total: reviewerSummary.length,
          required: requiredReviewers.length,
          approved: requiredApprovals,
          list: reviewerSummary,
        },
        message: `Reviewers updated: ${results.added.length} added, ${results.removed.length} removed${
          results.errors.length > 0 ? `, ${results.errors.length} errors` : ''
        }`,
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'MANAGE_REVIEWERS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to manage reviewers',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const manageReviewersTool = {
  name: 'manage_reviewers',
  description:
    'Add or remove reviewers from a pull request. Can mark reviewers as required. Returns updated reviewer list with vote status. Use this to assign code reviewers or remove reviewers who are no longer needed.',
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
      addReviewers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Reviewer user ID or email',
            },
            isRequired: {
              type: 'boolean',
              description: 'Mark as required reviewer',
              default: false,
            },
          },
          required: ['id'],
        },
        description: 'Reviewers to add',
      },
      removeReviewers: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Reviewer IDs to remove',
      },
    },
    required: ['prId'],
  },
};
