/**
 * get_pr_changes tool
 * List all changed files in a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_pr_changes
 */
export const GetPRChangesSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  skip: z.number().optional().default(0).describe('Number of files to skip (for pagination)'),
  top: z.number().optional().default(100).describe('Maximum number of files to return (default: 100)'),
});

export type GetPRChangesInput = z.infer<typeof GetPRChangesSchema>;

/**
 * Map change type to readable string
 */
function mapChangeType(changeType: number | undefined): string {
  switch (changeType) {
    case 1:
      return 'add';
    case 2:
      return 'edit';
    case 4:
      return 'delete';
    case 8:
      return 'rename';
    case 16:
      return 'edit'; // Encoding change
    default:
      return 'unknown';
  }
}

/**
 * Get PR changed files
 */
export async function getPRChanges(input: GetPRChangesInput): Promise<ToolResponse> {
  try {
    const params = GetPRChangesSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get PR to verify it exists
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

    // Get commit range for PR
    const prCommits = await gitApi.getPullRequestCommits(repoId, params.prId, project);

    if (!prCommits || prCommits.length === 0) {
      return {
        success: true,
        data: {
          files: [],
          count: 0,
          stats: { totalChanges: 0 },
          message: 'No commits found in PR',
        },
      };
    }

    // Get last commit to compare
    const lastCommitId = prCommits[prCommits.length - 1]?.commitId;
    const targetCommitId = pr.lastMergeTargetCommit?.commitId;

    if (!lastCommitId || !targetCommitId) {
      return {
        success: false,
        error: {
          code: 'COMMIT_INFO_MISSING',
          message: 'Could not determine commit range for PR',
        },
      };
    }

    // Get diff between commits
    const diff = await gitApi.getCommitDiffs(
      repoId,
      project,
      true, // diffCommonCommit
      params.top,
      params.skip,
      {
        baseVersion: targetCommitId,
        baseVersionType: 0, // Commit
        targetVersion: lastCommitId,
        targetVersionType: 0, // Commit
      }
    );

    if (!diff || !diff.changes) {
      return {
        success: true,
        data: {
          files: [],
          count: 0,
          stats: { totalChanges: 0 },
          message: 'No file changes found',
        },
      };
    }

    // Format file changes
    const files = diff.changes.map((change) => {
      const changeType = mapChangeType(change.changeType);
      const item = change.item;

      return {
        path: item?.path || '',
        changeType,
        isDirectory: item?.isFolder || false,
        url: item?.url || '',
      };
    });

    // Filter out directories
    const fileChanges = files.filter((f) => !f.isDirectory);

    // Calculate stats
    const stats = {
      totalChanges: fileChanges.length,
    };

    // Group by change type
    const byChangeType = {
      added: fileChanges.filter((f) => f.changeType === 'add').length,
      edited: fileChanges.filter((f) => f.changeType === 'edit').length,
      deleted: fileChanges.filter((f) => f.changeType === 'delete').length,
      renamed: fileChanges.filter((f) => f.changeType === 'rename').length,
    };

    // Suggested actions
    const suggestedActions = [];

    if (fileChanges.length > 0) {
      const firstFile = fileChanges[0];
      suggestedActions.push({
        tool: 'get_file_diff',
        params: { prId: params.prId, filePath: firstFile.path },
        reason: `View diff for ${firstFile.path}`,
        priority: 'medium' as const,
      });

      if (fileChanges.some((f) => f.changeType === 'add' || f.changeType === 'edit')) {
        suggestedActions.push({
          tool: 'add_comment',
          params: { prId: params.prId, filePath: firstFile.path, line: 1 },
          reason: 'Add inline comment on changed file',
          priority: 'low' as const,
        });
      }
    }

    return {
      success: true,
      data: {
        files: fileChanges,
        count: fileChanges.length,
        stats,
        byChangeType,
        hasMore: fileChanges.length === params.top,
        pagination: {
          skip: params.skip,
          top: params.top,
          total: fileChanges.length,
        },
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_CHANGES_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get PR changes',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getPRChangesTool = {
  name: 'get_pr_changes',
  description:
    'List all changed files in a pull request. Returns file paths, change types (add/edit/delete/rename), and statistics. Use this to see what files were modified before reviewing specific diffs. Supports pagination for PRs with many files.',
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
      skip: {
        type: 'number',
        description: 'Number of files to skip (for pagination)',
        default: 0,
      },
      top: {
        type: 'number',
        description: 'Maximum number of files to return (default: 100)',
        default: 100,
      },
    },
    required: ['prId'],
  },
};
