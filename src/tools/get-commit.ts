/**
 * get_commit tool
 * Get details for a specific commit
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_commit
 */
export const GetCommitSchema = z.object({
  commitId: z.string().describe('Commit ID (full SHA or short SHA)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  includeChanges: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include list of changed files (default: false)'),
});

export type GetCommitInput = z.infer<typeof GetCommitSchema>;

/**
 * Get commit
 */
export async function getCommit(input: GetCommitInput): Promise<ToolResponse> {
  try {
    const params = GetCommitSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get commit details
    const commit = await gitApi.getCommit(params.commitId, repoId, project);

    if (!commit) {
      return {
        success: false,
        error: {
          code: 'COMMIT_NOT_FOUND',
          message: `Commit ${params.commitId} not found`,
        },
      };
    }

    // Format commit data
    const commitData = {
      commitId: commit.commitId || '',
      shortId: commit.commitId?.substring(0, 7) || '',
      author: {
        name: commit.author?.name || 'Unknown',
        email: commit.author?.email || '',
        date: commit.author?.date?.toISOString() || '',
      },
      committer: {
        name: commit.committer?.name || '',
        email: commit.committer?.email || '',
        date: commit.committer?.date?.toISOString() || '',
      },
      message: commit.comment || '',
      messageShort: commit.comment?.split('\n')[0] || '',
      parents: commit.parents?.map((p) => p.substring(0, 7)) || [],
      url: commit.url || '',
      remoteUrl: commit.remoteUrl || '',
      changeCounts: commit.changeCounts
        ? {
            add: commit.changeCounts.Add || 0,
            edit: commit.changeCounts.Edit || 0,
            delete: commit.changeCounts.Delete || 0,
            total:
              (commit.changeCounts.Add || 0) +
              (commit.changeCounts.Edit || 0) +
              (commit.changeCounts.Delete || 0),
          }
        : undefined,
    };

    // Get changed files if requested
    let changes: any[] = [];
    if (params.includeChanges) {
      const commitChanges = await gitApi.getChanges(params.commitId, repoId, project);
      if (commitChanges && commitChanges.changes) {
        changes = commitChanges.changes.map((change) => ({
          path: change.item?.path || '',
          changeType:
            change.changeType === 1
              ? 'add'
              : change.changeType === 2
              ? 'edit'
              : change.changeType === 4
              ? 'delete'
              : 'unknown',
        }));
      }
    }

    // Suggested actions
    const suggestedActions = [];

    if (commit.parents && commit.parents.length > 0) {
      suggestedActions.push({
        tool: 'get_commit',
        params: { commitId: commit.parents[0], repository: repoId },
        reason: 'View parent commit',
        priority: 'low' as const,
      });
    }

    if (changes.length > 0) {
      const firstFile = changes[0];
      suggestedActions.push({
        tool: 'get_file_content',
        params: { filePath: firstFile.path, repository: repoId },
        reason: `View ${firstFile.path}`,
        priority: 'medium' as const,
      });
    }

    return {
      success: true,
      data: {
        commit: commitData,
        changes: params.includeChanges ? changes : undefined,
        changesCount: changes.length,
        message: `✅ Commit ${commitData.shortId} retrieved`,
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_COMMIT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get commit',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getCommitTool = {
  name: 'get_commit',
  description:
    'Get details for a specific commit. Returns commit ID, author, committer, date, message, parent commits, and change counts. Can optionally include list of changed files. Use this to understand what changed in a specific commit.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      commitId: {
        type: 'string',
        description: 'Commit ID (full SHA or short SHA)',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      includeChanges: {
        type: 'boolean',
        description: 'Include list of changed files (default: false)',
        default: false,
      },
    },
    required: ['commitId'],
  },
};
