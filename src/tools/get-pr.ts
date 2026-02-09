/**
 * get_pr tool
 * Get pull request with tiered detail levels
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse, PRContext, ResponseLevel, PRPhase, PRStatus, Blocker } from '../types.js';

/**
 * Input schema for get_pr
 */
export const GetPRSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  level: z
    .enum(['summary', 'standard', 'detailed'])
    .optional()
    .default('standard')
    .describe(
      'Response detail level: summary (~200 tokens), standard (~800 tokens), detailed (~3000 tokens)'
    ),
  include: z
    .array(z.enum(['comments', 'files', 'reviewers', 'workitems']))
    .optional()
    .describe('Additional data to include (only used with standard/detailed level)'),
});

export type GetPRInput = z.infer<typeof GetPRSchema>;

/**
 * Determine PR phase from status and votes
 */
function determinePRPhase(
  status: number | undefined,
  isDraft: boolean,
  approvals: number,
  rejections: number,
  waiting: number,
  requiredApprovals: number
): PRPhase {
  // Completed
  if (status === 3) return 'completed';

  // Draft
  if (isDraft) return 'draft';

  // Blocked (rejections or waiting for author)
  if (rejections > 0 || waiting > 0) return 'blocked';

  // Merge ready (has required approvals and no blockers)
  if (approvals >= requiredApprovals && requiredApprovals > 0) return 'merge_ready';

  // Approved (has some approvals)
  if (approvals > 0) return 'approved';

  // In review
  return 'review';
}

/**
 * Map ADO status number to our type
 */
function mapPRStatus(status: number | undefined): PRStatus {
  switch (status) {
    case 1:
      return 'active';
    case 2:
      return 'abandoned';
    case 3:
      return 'completed';
    default:
      return 'draft';
  }
}

/**
 * Get pull request
 */
export async function getPR(input: GetPRInput): Promise<ToolResponse<PRContext>> {
  try {
    const params = GetPRSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get PR with all properties
    const pr = await gitApi.getPullRequest(repoId, params.prId, project);

    if (!pr) {
      return {
        success: false,
        error: {
          code: 'PR_NOT_FOUND',
          message: `Pull request #${params.prId} not found in ${project}/${repoId}`,
        },
      };
    }

    // Count votes
    const reviewers = pr.reviewers || [];
    const approvals = reviewers.filter((r) => r.vote === 10).length;
    const rejections = reviewers.filter((r) => r.vote === -10).length;
    const waiting = reviewers.filter((r) => r.vote === -5).length;
    const noVote = reviewers.filter((r) => r.vote === 0).length;

    // Get required reviewers
    const requiredReviewers = reviewers.filter((r) => r.isRequired);
    const requiredApprovals = requiredReviewers.filter((r) => r.vote === 10).length;

    // Determine phase
    const status = mapPRStatus(pr.status);
    const isDraft = pr.isDraft || false;
    const phase = determinePRPhase(
      pr.status,
      isDraft,
      approvals,
      rejections,
      waiting,
      requiredReviewers.length
    );

    // Get threads (for comment stats)
    const threads = await gitApi.getThreads(repoId, params.prId, project);
    const unresolvedThreads = threads.filter((t) => t.status === 1).length; // 1 = Active

    // Determine blockers
    const blockers: Blocker[] = [];

    if (rejections > 0) {
      blockers.push({
        type: 'approval',
        message: `${rejections} reviewer(s) rejected this PR`,
        howToFix: 'Address reviewer concerns and ask them to re-review',
        relatedTools: ['reply_to_thread', 'vote_on_pr'],
      });
    }

    if (waiting > 0) {
      blockers.push({
        type: 'approval',
        message: `${waiting} reviewer(s) waiting for author`,
        howToFix: 'Address feedback and update the PR',
        relatedTools: ['reply_to_thread'],
      });
    }

    if (unresolvedThreads > 0) {
      blockers.push({
        type: 'thread',
        message: `${unresolvedThreads} unresolved comment thread(s)`,
        howToFix: 'Reply to comments and mark threads as resolved',
        relatedTools: ['reply_to_thread', 'update_thread_status'],
      });
    }

    if (requiredReviewers.length > 0 && requiredApprovals < requiredReviewers.length) {
      const needed = requiredReviewers.length - requiredApprovals;
      blockers.push({
        type: 'approval',
        message: `Need ${needed} more required approval(s)`,
        howToFix: 'Wait for required reviewers to approve',
        relatedTools: ['manage_reviewers'],
      });
    }

    // Get merge status
    const canMerge = pr.mergeStatus === 3 && blockers.length === 0; // 3 = Succeeded

    // Build PR context
    const context: PRContext = {
      pr: {
        id: pr.pullRequestId!,
        title: pr.title || 'Untitled PR',
        description: pr.description || '',
        status,
        isDraft,
        createdBy: pr.createdBy?.displayName || 'Unknown',
        creationDate: pr.creationDate?.toISOString() || '',
        sourceBranch: pr.sourceRefName?.replace('refs/heads/', '') || '',
        targetBranch: pr.targetRefName?.replace('refs/heads/', '') || '',
        repository: pr.repository?.name || repoId,
        url: `${pr.repository?.webUrl}/pullrequest/${pr.pullRequestId}`,
      },
      stats: {
        comments: {
          total: threads.length,
          unresolved: unresolvedThreads,
        },
        votes: {
          approve: approvals,
          reject: rejections,
          waiting,
          noVote,
        },
        files: {
          changed: 0, // Will fetch if needed
          additions: 0,
          deletions: 0,
        },
        commits: pr.commits?.length || 0,
        requiredReviewers: {
          total: requiredReviewers.length,
          approved: requiredApprovals,
        },
      },
      state: {
        phase,
        canMerge,
        blockers,
        warnings: [],
      },
      suggestedActions: [],
    };

    // Add warnings
    if (isDraft) {
      context.state.warnings.push('PR is in draft mode - publish when ready for review');
    }

    if (pr.mergeStatus === 2) {
      // 2 = Conflicts
      context.state.warnings.push('PR has merge conflicts - resolve conflicts before merging');
    }

    // Suggested actions based on phase
    if (phase === 'draft') {
      context.suggestedActions.push({
        tool: 'update_pr',
        params: { prId: params.prId, isDraft: false },
        reason: 'Publish PR to start review',
        priority: 'high',
      });
    } else if (phase === 'review') {
      context.suggestedActions.push({
        tool: 'vote_on_pr',
        params: { prId: params.prId, vote: 10 },
        reason: 'Approve PR if code looks good',
        priority: 'high',
      });
      if (unresolvedThreads > 0) {
        context.suggestedActions.push({
          tool: 'list_comments',
          params: { prId: params.prId },
          reason: 'Review comment threads',
          priority: 'medium',
        });
      }
    } else if (phase === 'blocked') {
      if (unresolvedThreads > 0) {
        context.suggestedActions.push({
          tool: 'list_comments',
          params: { prId: params.prId, status: 'active' },
          reason: 'Address unresolved comments',
          priority: 'high',
        });
      }
    } else if (phase === 'approved' || phase === 'merge_ready') {
      context.suggestedActions.push({
        tool: 'check_merge_readiness',
        params: { prId: params.prId },
        reason: 'Verify PR is ready to merge',
        priority: 'high',
      });
      if (canMerge) {
        context.suggestedActions.push({
          tool: 'complete_pr',
          params: { prId: params.prId },
          reason: 'Merge the PR',
          priority: 'high',
        });
      }
    }

    // Include additional data based on level and includes
    if (params.level === 'standard' || params.level === 'detailed') {
      const includes = params.include || [];

      // Comments (standard+)
      if (includes.includes('comments') || params.level === 'detailed') {
        context.comments = threads.map((thread) => ({
          id: thread.id!,
          status: thread.status === 1 ? 'active' : 'fixed',
          comments:
            thread.comments?.map((c) => ({
              id: c.id!,
              content: c.content || '',
              author: c.author?.displayName || 'Unknown',
              publishedDate: c.publishedDate?.toISOString() || '',
              commentType: c.commentType === 1 ? 'text' : 'system',
            })) || [],
          context: thread.threadContext?.filePath
            ? {
                filePath: thread.threadContext.filePath,
                line: thread.threadContext.rightFileStart?.line || 0,
                changeType: 'edit',
              }
            : undefined,
          canResolve: thread.status === 1,
        }));
      }

      // Reviewers (standard+)
      if (includes.includes('reviewers') || params.level === 'detailed') {
        context.reviewers = reviewers.map((r) => ({
          id: r.id || '',
          displayName: r.displayName || 'Unknown',
          isRequired: r.isRequired || false,
          vote: (r.vote as any) || 0,
          hasDeclined: r.hasDeclined || false,
        }));
      }

      // Files (detailed only or explicit include)
      if (includes.includes('files') || params.level === 'detailed') {
        // This would require additional API call to get file changes
        // For now, we'll note that it needs implementation
        context.files = [];
      }
    }

    return {
      success: true,
      data: context,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_PR_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get pull request',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getPRTool = {
  name: 'get_pr',
  description:
    'Get pull request details with tiered responses. Returns PR info, stats, current state, blockers, and suggested actions. Use level=summary for quick status, level=standard for normal use, level=detailed for full context.',
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
      level: {
        type: 'string',
        enum: ['summary', 'standard', 'detailed'],
        description:
          'Response detail level: summary (~200 tokens), standard (~800 tokens), detailed (~3000 tokens)',
        default: 'standard',
      },
      include: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['comments', 'files', 'reviewers', 'workitems'],
        },
        description: 'Additional data to include (only used with standard/detailed level)',
      },
    },
    required: ['prId'],
  },
};
