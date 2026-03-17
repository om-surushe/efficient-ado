/**
 * get_file_blame tool
 * Get the commit history (blame) for a specific file
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_file_blame
 */
export const GetFileBlameSchema = z.object({
  filePath: z.string().describe('Path to the file (e.g., "src/main.ts")'),
  branch: z.string().optional().describe('Branch name (uses default branch if not specified)'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Maximum number of commits to return (default: 20)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type GetFileBlameInput = z.infer<typeof GetFileBlameSchema>;

/**
 * Get file blame/history
 */
export async function getFileBlame(input: GetFileBlameInput): Promise<ToolResponse> {
  try {
    const params = GetFileBlameSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);
    const gitApi = await getGitApi();

    const repo = await gitApi.getRepository(repoId, project);
    const branchName = params.branch
      ? params.branch.replace(/^refs\/heads\//, '')
      : (repo.defaultBranch || 'refs/heads/main').replace('refs/heads/', '');

    // Get commits that modified this specific file
    const commits = await gitApi.getCommits(
      repoId,
      {
        itemPath: params.filePath,
        itemVersion: { version: branchName },
      },
      project,
      undefined,
      params.limit
    );

    if (!commits || commits.length === 0) {
      return {
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: `No commit history found for '${params.filePath}' on branch '${branchName}'`,
          details: { hint: 'Check that the file path is correct and the branch exists' },
        },
      };
    }

    const history = commits.map((commit) => ({
      commitId: commit.commitId || '',
      shortId: (commit.commitId || '').substring(0, 8),
      author: commit.author?.name || 'Unknown',
      authorEmail: commit.author?.email || '',
      date: commit.author?.date?.toISOString() || '',
      message: commit.comment || '',
      shortMessage: (commit.comment || '').split('\n')[0].substring(0, 120),
    }));

    return {
      success: true,
      data: {
        filePath: params.filePath,
        branch: branchName,
        history,
        count: history.length,
        latestAuthor: history[0]?.author || 'Unknown',
        latestChange: history[0]?.date || '',
        message: `Found ${history.length} commit(s) modifying ${params.filePath}`,
        suggestedActions: [
          {
            tool: 'get_commit',
            params: { commitId: history[0]?.commitId },
            reason: 'View the latest commit that modified this file',
            priority: 'medium' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_BLAME_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get file blame/history',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getFileBlameTool = {
  name: 'get_file_blame',
  description:
    'Get the commit history for a specific file — who last changed it, when, and with what commit message. Returns commits sorted by most recent. Use this to understand ownership or track down when a change was introduced.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string', description: 'Path to the file (e.g., "src/main.ts")' },
      branch: {
        type: 'string',
        description: 'Branch name (uses default branch if not specified)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of commits to return (default: 20)',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
    required: ['filePath'],
  },
};
