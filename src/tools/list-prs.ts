/**
 * list_prs tool
 * List pull requests with filters and rich context
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse, PRStatus } from '../types.js';
import {
  GitPullRequestSearchCriteria,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';

/**
 * Input schema for list_prs
 */
export const ListPRsSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  status: z
    .enum(['active', 'completed', 'abandoned', 'all'])
    .optional()
    .default('active')
    .describe('Filter by PR status (default: active)'),
  createdBy: z.string().optional().describe('Filter by creator (user ID or email)'),
  reviewerId: z.string().optional().describe('Filter by reviewer (user ID)'),
  sourceBranch: z.string().optional().describe('Filter by source branch name'),
  targetBranch: z.string().optional().describe('Filter by target branch name'),
  limit: z.number().min(1).max(100).optional().default(25).describe('Maximum results (1-100, default: 25)'),
});

export type ListPRsInput = z.infer<typeof ListPRsSchema>;

/**
 * Map status filter to ADO API enum
 */
function mapStatus(status: string): PullRequestStatus | undefined {
  switch (status) {
    case 'active':
      return PullRequestStatus.Active;
    case 'completed':
      return PullRequestStatus.Completed;
    case 'abandoned':
      return PullRequestStatus.Abandoned;
    case 'all':
      return PullRequestStatus.All;
    default:
      return PullRequestStatus.Active;
  }
}

/**
 * Map ADO status to our type
 */
function mapPRStatus(status: PullRequestStatus | undefined): PRStatus {
  switch (status) {
    case PullRequestStatus.Active:
      return 'active';
    case PullRequestStatus.Completed:
      return 'completed';
    case PullRequestStatus.Abandoned:
      return 'abandoned';
    default:
      return 'active';
  }
}

/**
 * List pull requests
 */
export async function listPRs(input: ListPRsInput): Promise<ToolResponse> {
  try {
    const params = ListPRsSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Build search criteria
    const searchCriteria: GitPullRequestSearchCriteria = {
      status: mapStatus(params.status),
      creatorId: params.createdBy,
      reviewerId: params.reviewerId,
      sourceRefName: params.sourceBranch ? `refs/heads/${params.sourceBranch}` : undefined,
      targetRefName: params.targetBranch ? `refs/heads/${params.targetBranch}` : undefined,
    };

    // Get PRs
    const prs = await gitApi.getPullRequests(repoId, searchCriteria, project, undefined, 0, params.limit);

    if (!prs || prs.length === 0) {
      return {
        success: true,
        data: {
          prs: [],
          count: 0,
          message: 'No pull requests found matching your filters',
          filters: {
            project,
            repository: repoId,
            status: params.status,
            createdBy: params.createdBy,
            reviewerId: params.reviewerId,
            sourceBranch: params.sourceBranch,
            targetBranch: params.targetBranch,
          },
          suggestedActions: [
            {
              tool: 'list_prs',
              params: { status: 'all' },
              reason: 'Try viewing all PRs (active, completed, abandoned)',
              priority: 'medium' as const,
            },
            {
              tool: 'create_pr',
              params: {},
              reason: 'Create a new pull request',
              priority: 'low' as const,
            },
          ],
        },
      };
    }

    // Format PR summaries
    const prSummaries = prs.map((pr) => {
      const isDraft = pr.isDraft || false;
      const status = mapPRStatus(pr.status);

      // Count votes
      const reviewers = pr.reviewers || [];
      const approvals = reviewers.filter((r) => r.vote === 10).length;
      const rejections = reviewers.filter((r) => r.vote === -10).length;
      const waiting = reviewers.filter((r) => r.vote === -5).length;

      // Determine phase
      let phase: 'draft' | 'review' | 'approved' | 'merge_ready' | 'blocked' | 'completed' = 'review';
      if (status === 'completed') {
        phase = 'completed';
      } else if (isDraft) {
        phase = 'draft';
      } else if (rejections > 0 || waiting > 0) {
        phase = 'blocked';
      } else if (approvals > 0) {
        phase = 'approved';
      }

      return {
        id: pr.pullRequestId!,
        title: pr.title || 'Untitled PR',
        status,
        isDraft,
        phase,
        createdBy: pr.createdBy?.displayName || 'Unknown',
        creationDate: pr.creationDate?.toISOString() || '',
        sourceBranch: pr.sourceRefName?.replace('refs/heads/', '') || '',
        targetBranch: pr.targetRefName?.replace('refs/heads/', '') || '',
        url: `${pr.repository?.webUrl}/pullrequest/${pr.pullRequestId}`,
        stats: {
          approvals,
          rejections,
          waiting,
          unresolved: pr.mergeStatus?.failureMessage ? 1 : 0,
        },
      };
    });

    // Group by phase
    const byPhase = {
      draft: prSummaries.filter((p) => p.phase === 'draft').length,
      review: prSummaries.filter((p) => p.phase === 'review').length,
      approved: prSummaries.filter((p) => p.phase === 'approved').length,
      merge_ready: prSummaries.filter((p) => p.phase === 'merge_ready').length,
      blocked: prSummaries.filter((p) => p.phase === 'blocked').length,
      completed: prSummaries.filter((p) => p.phase === 'completed').length,
    };

    // Suggested actions based on results
    const suggestedActions = [];

    // If there are PRs needing review
    const needingReview = prSummaries.filter((p) => p.phase === 'review' || p.phase === 'approved');
    if (needingReview.length > 0) {
      const firstPR = needingReview[0];
      suggestedActions.push({
        tool: 'start_review',
        params: { prId: firstPR.id },
        reason: `Review PR #${firstPR.id}: ${firstPR.title}`,
        priority: 'high' as const,
      });
    }

    // If there are blocked PRs
    const blocked = prSummaries.filter((p) => p.phase === 'blocked');
    if (blocked.length > 0) {
      const firstBlocked = blocked[0];
      suggestedActions.push({
        tool: 'get_pr',
        params: { prId: firstBlocked.id, level: 'detailed' },
        reason: `Check why PR #${firstBlocked.id} is blocked`,
        priority: 'high' as const,
      });
    }

    // If there are approved PRs
    const approved = prSummaries.filter((p) => p.phase === 'approved');
    if (approved.length > 0) {
      const firstApproved = approved[0];
      suggestedActions.push({
        tool: 'check_merge_readiness',
        params: { prId: firstApproved.id },
        reason: `PR #${firstApproved.id} is approved - check if ready to merge`,
        priority: 'medium' as const,
      });
    }

    return {
      success: true,
      data: {
        prs: prSummaries,
        count: prSummaries.length,
        summary: {
          total: prSummaries.length,
          byPhase,
          byStatus: {
            active: prSummaries.filter((p) => p.status === 'active').length,
            completed: prSummaries.filter((p) => p.status === 'completed').length,
            abandoned: prSummaries.filter((p) => p.status === 'abandoned').length,
          },
        },
        filters: {
          project,
          repository: repoId,
          status: params.status,
          createdBy: params.createdBy,
          reviewerId: params.reviewerId,
          sourceBranch: params.sourceBranch,
          targetBranch: params.targetBranch,
        },
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_PRS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list pull requests',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const listPRsTool = {
  name: 'list_prs',
  description:
    'List pull requests with filters. Returns PR summaries with stats, phase, and suggested actions. Use this to discover PRs that need attention.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      status: {
        type: 'string',
        enum: ['active', 'completed', 'abandoned', 'all'],
        description: 'Filter by PR status (default: active)',
        default: 'active',
      },
      createdBy: {
        type: 'string',
        description: 'Filter by creator (user ID or email)',
      },
      reviewerId: {
        type: 'string',
        description: 'Filter by reviewer (user ID)',
      },
      sourceBranch: {
        type: 'string',
        description: 'Filter by source branch name',
      },
      targetBranch: {
        type: 'string',
        description: 'Filter by target branch name',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-100, default: 25)',
        minimum: 1,
        maximum: 100,
        default: 25,
      },
    },
  },
};
