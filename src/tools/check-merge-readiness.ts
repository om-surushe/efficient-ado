/**
 * check_merge_readiness tool
 * Pre-merge validation - check if PR is ready to merge
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse, Blocker } from '../types.js';

/**
 * Input schema for check_merge_readiness
 */
export const CheckMergeReadinessSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type CheckMergeReadinessInput = z.infer<typeof CheckMergeReadinessSchema>;

/**
 * Check if PR is ready to merge
 */
export async function checkMergeReadiness(input: CheckMergeReadinessInput): Promise<ToolResponse> {
  try {
    const params = CheckMergeReadinessSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get PR
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

    // Check if PR is already completed or abandoned
    if (pr.status === 3) {
      return {
        success: true,
        data: {
          canMerge: false,
          reason: 'PR is already completed',
          status: 'completed',
          blockers: [],
          suggestions: [],
        },
      };
    }

    if (pr.status === 2) {
      return {
        success: true,
        data: {
          canMerge: false,
          reason: 'PR is abandoned',
          status: 'abandoned',
          blockers: [],
          suggestions: [
            {
              tool: 'reactivate_pr',
              params: { prId: params.prId },
              reason: 'Reactivate the PR if you want to merge it',
              priority: 'medium' as const,
            },
          ],
        },
      };
    }

    // Get threads for unresolved comments
    const threads = await gitApi.getThreads(repoId, params.prId, project);
    const unresolvedThreads = threads.filter((t) => t.status === 1).length;

    // Get reviewers
    const reviewers = pr.reviewers || [];
    const approvals = reviewers.filter((r) => r.vote === 10).length;
    const rejections = reviewers.filter((r) => r.vote === -10).length;
    const waiting = reviewers.filter((r) => r.vote === -5).length;

    const requiredReviewers = reviewers.filter((r) => r.isRequired);
    const requiredApprovals = requiredReviewers.filter((r) => (r.vote ?? 0) >= 5).length;

    // Build blockers list
    const blockers: Blocker[] = [];

    // Check draft status
    if (pr.isDraft) {
      blockers.push({
        type: 'policy',
        message: 'PR is in draft mode',
        howToFix: 'Publish the PR before merging',
        relatedTools: ['update_pr'],
      });
    }

    // Check merge status (conflicts, etc.)
    if (pr.mergeStatus === 2) {
      blockers.push({
        type: 'conflict',
        message: 'PR has merge conflicts',
        howToFix: 'Resolve merge conflicts in the source branch',
      });
    }

    if (pr.mergeStatus === 0) {
      blockers.push({
        type: 'conflict',
        message: 'Merge status not computed',
        howToFix: 'Wait for merge status to be computed, or check for issues',
      });
    }

    // Check rejections
    if (rejections > 0) {
      blockers.push({
        type: 'approval',
        message: `${rejections} reviewer(s) rejected this PR`,
        howToFix: 'Address reviewer concerns and get approvals',
        relatedTools: ['list_comments', 'reply_to_thread'],
      });
    }

    // Check waiting for author
    if (waiting > 0) {
      blockers.push({
        type: 'approval',
        message: `${waiting} reviewer(s) waiting for author`,
        howToFix: 'Address feedback and update the PR',
        relatedTools: ['list_comments', 'reply_to_thread'],
      });
    }

    // Check required approvals
    if (requiredReviewers.length > 0 && requiredApprovals < requiredReviewers.length) {
      const needed = requiredReviewers.length - requiredApprovals;
      blockers.push({
        type: 'approval',
        message: `Need ${needed} more required approval(s)`,
        howToFix: 'Wait for required reviewers to approve, or add more reviewers',
        relatedTools: ['manage_reviewers'],
      });
    }

    // Check unresolved threads
    if (unresolvedThreads > 0) {
      blockers.push({
        type: 'thread',
        message: `${unresolvedThreads} unresolved comment thread(s)`,
        howToFix: 'Reply to comments and mark threads as resolved',
        relatedTools: ['list_comments', 'reply_to_thread', 'update_thread_status'],
      });
    }

    // Determine if can merge
    const canMerge = blockers.length === 0 && pr.mergeStatus === 3; // 3 = Succeeded

    // Build suggestions
    const suggestions = [];

    if (canMerge) {
      suggestions.push({
        tool: 'complete_pr',
        params: { prId: params.prId, mergeStrategy: 'squash' },
        reason: 'PR is ready - merge with squash strategy (recommended)',
        priority: 'high' as const,
      });
      suggestions.push({
        tool: 'complete_pr',
        params: { prId: params.prId, mergeStrategy: 'merge' },
        reason: 'Alternative: merge with regular merge commit',
        priority: 'medium' as const,
      });
    } else {
      // Add suggestions based on blockers
      blockers.forEach((blocker) => {
        if (blocker.relatedTools && blocker.relatedTools.length > 0) {
          suggestions.push({
            tool: blocker.relatedTools[0],
            params: { prId: params.prId },
            reason: blocker.howToFix,
            priority: 'high' as const,
          });
        }
      });
    }

    return {
      success: true,
      data: {
        canMerge,
        status: canMerge ? 'ready' : 'blocked',
        mergeStatus: {
          code: pr.mergeStatus,
          description:
            pr.mergeStatus === 3
              ? 'Succeeded'
              : pr.mergeStatus === 2
              ? 'Conflicts'
              : pr.mergeStatus === 1
              ? 'Queued'
              : 'Not Computed',
        },
        checks: {
          isDraft: pr.isDraft || false,
          hasConflicts: pr.mergeStatus === 2,
          approvals: {
            total: approvals,
            required: requiredReviewers.length,
            requiredApprovals,
            rejections,
            waiting,
          },
          unresolvedThreads,
        },
        blockers,
        suggestedActions: suggestions,
        message: canMerge
          ? '✅ PR is ready to merge'
          : `❌ PR cannot be merged: ${blockers.length} blocker(s)`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'CHECK_MERGE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to check merge readiness',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const checkMergeReadinessTool = {
  name: 'check_merge_readiness',
  description:
    'Check if a pull request is ready to merge. Validates all policies, approvals, conflicts, and threads. Returns detailed blockers with fix instructions and suggested actions. Use this before attempting to merge a PR.',
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
    },
    required: ['prId'],
  },
};
