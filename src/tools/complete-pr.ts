/**
 * complete_pr tool
 * Complete (merge) a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';
import { GitPullRequestCompletionOptions } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

/**
 * Input schema for complete_pr
 */
export const CompletePRSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  mergeStrategy: z
    .enum(['noFastForward', 'squash', 'rebase', 'rebaseMerge'])
    .optional()
    .default('squash')
    .describe(
      'Merge strategy: noFastForward (regular merge), squash (squash all commits), rebase (rebase then fast-forward), rebaseMerge (rebase then create merge commit). Default: squash'
    ),
  deleteSourceBranch: z
    .boolean()
    .optional()
    .default(true)
    .describe('Delete source branch after merge (default: true)'),
  squashCommitMessage: z
    .string()
    .optional()
    .describe('Custom commit message for squash merge (uses PR title + description if not provided)'),
  bypassPolicy: z
    .boolean()
    .optional()
    .default(false)
    .describe('Bypass branch policies (requires permissions, use with caution)'),
  completeWorkItems: z
    .boolean()
    .optional()
    .default(true)
    .describe('Complete linked work items when merging (default: true)'),
});

export type CompletePRInput = z.infer<typeof CompletePRSchema>;

/**
 * Map merge strategy to ADO enum
 */
function mapMergeStrategy(strategy: string): number {
  switch (strategy) {
    case 'noFastForward':
      return 1; // No fast-forward
    case 'squash':
      return 2; // Squash
    case 'rebase':
      return 3; // Rebase
    case 'rebaseMerge':
      return 4; // Rebase merge
    default:
      return 2; // Default to squash
  }
}

/**
 * Complete (merge) a pull request
 */
export async function completePR(input: CompletePRInput): Promise<ToolResponse> {
  try {
    const params = CompletePRSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get PR first to check status
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

    // Check if already completed
    if (pr.status === 3) {
      return {
        success: false,
        error: {
          code: 'PR_ALREADY_COMPLETED',
          message: 'Pull request is already completed',
        },
      };
    }

    // Check if abandoned
    if (pr.status === 2) {
      return {
        success: false,
        error: {
          code: 'PR_ABANDONED',
          message: 'Pull request is abandoned. Reactivate it first.',
          details: {
            howToFix: 'Use reactivate_pr tool to reopen this PR',
          },
        },
      };
    }

    // Check merge status (unless bypassing)
    if (!params.bypassPolicy && pr.mergeStatus !== 3) {
      return {
        success: false,
        error: {
          code: 'MERGE_BLOCKED',
          message:
            pr.mergeStatus === 2
              ? 'PR has merge conflicts'
              : pr.mergeStatus === 0
              ? 'Merge status not computed'
              : 'PR is not ready to merge',
          details: {
            mergeStatus: pr.mergeStatus,
            howToFix:
              pr.mergeStatus === 2
                ? 'Resolve merge conflicts first'
                : 'Check merge readiness with check_merge_readiness tool',
            relatedTools: ['check_merge_readiness'],
          },
        },
      };
    }

    // Build completion options
    const completionOptions: GitPullRequestCompletionOptions = {
      mergeStrategy: mapMergeStrategy(params.mergeStrategy),
      deleteSourceBranch: params.deleteSourceBranch,
      squashMerge: params.mergeStrategy === 'squash',
      bypassPolicy: params.bypassPolicy,
      transitionWorkItems: params.completeWorkItems,
    };

    // Add custom commit message for squash
    if (params.mergeStrategy === 'squash' && params.squashCommitMessage) {
      completionOptions.mergeCommitMessage = params.squashCommitMessage;
    }

    // Update PR to complete status
    const updatePR = {
      status: 3, // Completed
      lastMergeSourceCommit: pr.lastMergeSourceCommit,
      completionOptions,
    };

    const completedPR = await gitApi.updatePullRequest(updatePR, repoId, params.prId, project);

    // Get merge commit info
    const mergeCommit = completedPR.lastMergeCommit?.commitId;

    return {
      success: true,
      data: {
        prId: params.prId,
        status: 'completed',
        mergeCommit: mergeCommit || 'Unknown',
        mergeStrategy: params.mergeStrategy,
        targetBranch: pr.targetRefName?.replace('refs/heads/', '') || '',
        sourceBranch: pr.sourceRefName?.replace('refs/heads/', '') || '',
        sourceDeleted: params.deleteSourceBranch,
        message: `✅ PR #${params.prId} merged successfully using ${params.mergeStrategy} strategy`,
        details: {
          title: pr.title || '',
          url: `${pr.repository?.webUrl}/pullrequest/${pr.pullRequestId}`,
          completedBy: completedPR.closedBy?.displayName || 'Unknown',
          completedDate: completedPR.closedDate?.toISOString() || new Date().toISOString(),
        },
        suggestedActions: [
          {
            tool: 'get_pr',
            params: { prId: params.prId, level: 'summary' },
            reason: 'View completed PR details',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'COMPLETE_PR_FAILED',
        message: error instanceof Error ? error.message : 'Failed to complete pull request',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const completePRTool = {
  name: 'complete_pr',
  description:
    'Complete (merge) a pull request. Supports multiple merge strategies: squash (recommended, combines all commits), noFastForward (regular merge commit), rebase (rebase then fast-forward), rebaseMerge (rebase then merge). Can delete source branch and complete work items automatically. Use check_merge_readiness first to verify the PR is ready.',
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
      mergeStrategy: {
        type: 'string',
        enum: ['noFastForward', 'squash', 'rebase', 'rebaseMerge'],
        description:
          'Merge strategy: squash (recommended), noFastForward (regular merge), rebase, rebaseMerge',
        default: 'squash',
      },
      deleteSourceBranch: {
        type: 'boolean',
        description: 'Delete source branch after merge (default: true)',
        default: true,
      },
      squashCommitMessage: {
        type: 'string',
        description: 'Custom commit message for squash merge',
      },
      bypassPolicy: {
        type: 'boolean',
        description: 'Bypass branch policies (requires permissions, use with caution)',
        default: false,
      },
      completeWorkItems: {
        type: 'boolean',
        description: 'Complete linked work items when merging (default: true)',
        default: true,
      },
    },
    required: ['prId'],
  },
};
