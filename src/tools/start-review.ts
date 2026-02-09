/**
 * start_review tool (Composite)
 * Get everything needed to review a PR in one call
 */

import { z } from 'zod';
import { getPR } from './get-pr.js';
import { ToolResponse, PRContext } from '../types.js';

/**
 * Input schema for start_review
 */
export const StartReviewSchema = z.object({
  prId: z.number().describe('Pull request ID to review'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  includeFiles: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include changed files list (adds ~500 tokens)'),
});

export type StartReviewInput = z.infer<typeof StartReviewSchema>;

/**
 * Start reviewing a PR - composite tool that gets everything in one call
 */
export async function startReview(input: StartReviewInput): Promise<ToolResponse<PRContext>> {
  try {
    const params = StartReviewSchema.parse(input);

    // Get PR with comments and reviewers included
    const includes = ['comments', 'reviewers'];
    if (params.includeFiles) {
      includes.push('files');
    }

    const result = await getPR({
      prId: params.prId,
      project: params.project,
      repository: params.repository,
      level: 'detailed',
      include: includes as ('comments' | 'files' | 'reviewers')[],
    });

    if (!result.success) {
      return result;
    }

    // Add review-specific suggested actions
    const context = result.data;
    
    // Override suggested actions with review-focused ones
    context.suggestedActions = [];

    // If there are unresolved comments, suggest addressing them first
    if (context.stats.comments.unresolved > 0) {
      context.suggestedActions.push({
        tool: 'address_comment',
        params: { prId: params.prId },
        reason: `Address ${context.stats.comments.unresolved} unresolved comment(s)`,
        priority: 'high',
      });
    }

    // If in review phase, suggest voting
    if (context.state.phase === 'review' || context.state.phase === 'approved') {
      context.suggestedActions.push({
        tool: 'quick_approve',
        params: { prId: params.prId, comment: 'LGTM' },
        reason: 'Approve PR if code looks good',
        priority: 'high',
      });
      
      context.suggestedActions.push({
        tool: 'vote_on_pr',
        params: { prId: params.prId, vote: -5 },
        reason: 'Request changes if needed',
        priority: 'medium',
      });
    }

    // If merge ready, suggest merge
    if (context.state.phase === 'merge_ready' && context.state.canMerge) {
      context.suggestedActions.push({
        tool: 'complete_pr',
        params: { prId: params.prId, mergeStrategy: 'squash' },
        reason: 'Merge the PR (squash strategy)',
        priority: 'high',
      });
    }

    // If blocked, suggest getting detailed blockers
    if (context.state.phase === 'blocked') {
      context.state.blockers.forEach((blocker) => {
        if (blocker.relatedTools && blocker.relatedTools.length > 0) {
          context.suggestedActions.push({
            tool: blocker.relatedTools[0],
            params: { prId: params.prId },
            reason: blocker.howToFix,
            priority: 'high',
          });
        }
      });
    }

    // Add action to view files if not included
    if (!params.includeFiles) {
      context.suggestedActions.push({
        tool: 'get_pr_changes',
        params: { prId: params.prId },
        reason: 'View list of changed files',
        priority: 'low',
      });
    }

    return {
      success: true,
      data: context,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'START_REVIEW_FAILED',
        message: error instanceof Error ? error.message : 'Failed to start review',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const startReviewTool = {
  name: 'start_review',
  description:
    'Start reviewing a pull request. Gets PR details, comments, reviewers, and optionally files in one call. Returns complete context with suggested review actions. This is the primary tool agents should use to begin reviewing a PR.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID to review',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      includeFiles: {
        type: 'boolean',
        description: 'Include changed files list (adds ~500 tokens)',
        default: false,
      },
    },
    required: ['prId'],
  },
};
