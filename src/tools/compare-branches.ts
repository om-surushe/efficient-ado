/**
 * compare_branches tool
 * Compare two branches to see differences
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for compare_branches
 */
export const CompareBranchesSchema = z.object({
  baseBranch: z.string().describe('Base branch (e.g., "main")'),
  targetBranch: z.string().describe('Target branch to compare (e.g., "feature/new-feature")'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type CompareBranchesInput = z.infer<typeof CompareBranchesSchema>;

/**
 * Compare branches
 */
export async function compareBranches(input: CompareBranchesInput): Promise<ToolResponse> {
  try {
    const params = CompareBranchesSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get commits for both branches
    const baseCommits = await gitApi.getCommits(
      repoId,
      {
        itemVersion: {
          version: params.baseBranch,
          versionType: 0, // Branch
        },
        $top: 1,
      },
      project
    );

    const targetCommits = await gitApi.getCommits(
      repoId,
      {
        itemVersion: {
          version: params.targetBranch,
          versionType: 0, // Branch
        },
        $top: 1,
      },
      project
    );

    if (!baseCommits || baseCommits.length === 0) {
      return {
        success: false,
        error: {
          code: 'BASE_BRANCH_NOT_FOUND',
          message: `Base branch "${params.baseBranch}" not found`,
        },
      };
    }

    if (!targetCommits || targetCommits.length === 0) {
      return {
        success: false,
        error: {
          code: 'TARGET_BRANCH_NOT_FOUND',
          message: `Target branch "${params.targetBranch}" not found`,
        },
      };
    }

    const baseCommitId = baseCommits[0].commitId!;
    const targetCommitId = targetCommits[0].commitId!;

    // Check if branches are identical
    if (baseCommitId === targetCommitId) {
      return {
        success: true,
        data: {
          baseBranch: params.baseBranch,
          targetBranch: params.targetBranch,
          identical: true,
          aheadCount: 0,
          behindCount: 0,
          message: `Branches are identical (both at ${baseCommitId.substring(0, 7)})`,
        },
      };
    }

    // Get commit comparison
    const comparison = await gitApi.getCommitsBatch(
      {
        itemVersion: {
          version: params.targetBranch,
          versionType: 0,
        },
        compareVersion: {
          version: params.baseBranch,
          versionType: 0,
        },
        $top: 100,
      },
      repoId,
      project
    );

    const aheadCommits = comparison || [];
    const aheadCount = aheadCommits.length;

    // Get commits in base that are not in target (behind count)
    const baseOnly = await gitApi.getCommitsBatch(
      {
        itemVersion: {
          version: params.baseBranch,
          versionType: 0,
        },
        compareVersion: {
          version: params.targetBranch,
          versionType: 0,
        },
        $top: 100,
      },
      repoId,
      project
    );

    const behindCount = baseOnly?.length || 0;

    // Format ahead commits
    const commitsAhead = aheadCommits.slice(0, 10).map((commit) => ({
      commitId: commit.commitId?.substring(0, 7) || '',
      author: commit.author?.name || 'Unknown',
      date: commit.author?.date?.toISOString() || '',
      message: commit.comment?.split('\n')[0] || '',
    }));

    // Determine status
    let status = '';
    if (aheadCount > 0 && behindCount > 0) {
      status = 'diverged';
    } else if (aheadCount > 0) {
      status = 'ahead';
    } else if (behindCount > 0) {
      status = 'behind';
    } else {
      status = 'up-to-date';
    }

    // Suggested actions
    const suggestedActions = [];

    if (status === 'ahead' || status === 'diverged') {
      suggestedActions.push({
        tool: 'create_pr',
        params: {
          sourceBranch: params.targetBranch,
          targetBranch: params.baseBranch,
          title: `Merge ${params.targetBranch} into ${params.baseBranch}`,
        },
        reason: `Create PR to merge changes (${aheadCount} commits ahead)`,
        priority: 'high' as const,
      });
    }

    if (status === 'behind' || status === 'diverged') {
      suggestedActions.push({
        tool: 'list_commits',
        params: { branch: params.baseBranch, limit: behindCount },
        reason: `View commits in ${params.baseBranch} that are not in ${params.targetBranch}`,
        priority: 'medium' as const,
      });
    }

    return {
      success: true,
      data: {
        baseBranch: params.baseBranch,
        targetBranch: params.targetBranch,
        identical: false,
        status,
        aheadCount,
        behindCount,
        commitsAhead: commitsAhead.length > 0 ? commitsAhead : undefined,
        message:
          status === 'ahead'
            ? `${params.targetBranch} is ${aheadCount} commit(s) ahead of ${params.baseBranch}`
            : status === 'behind'
            ? `${params.targetBranch} is ${behindCount} commit(s) behind ${params.baseBranch}`
            : status === 'diverged'
            ? `Branches have diverged: ${aheadCount} ahead, ${behindCount} behind`
            : 'Branches are up to date',
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'COMPARE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to compare branches',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const compareBranchesTool = {
  name: 'compare_branches',
  description:
    'Compare two branches to see differences. Returns ahead/behind counts, status (ahead/behind/diverged/up-to-date), and lists commits that are ahead. Use this before creating PRs to understand what will be merged.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      baseBranch: {
        type: 'string',
        description: 'Base branch (e.g., "main")',
      },
      targetBranch: {
        type: 'string',
        description: 'Target branch to compare (e.g., "feature/new-feature")',
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
    required: ['baseBranch', 'targetBranch'],
  },
};
