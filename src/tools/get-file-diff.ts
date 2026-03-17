/**
 * get_file_diff tool
 * Get the diff for a specific file in a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_file_diff
 */
export const GetFileDiffSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  filePath: z.string().describe('Path to the file (e.g., "src/main.ts")'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  format: z
    .enum(['summary'])
    .optional()
    .default('summary')
    .describe('Diff format: summary (change type and metadata). Use get_file_content with includeOriginal=true to retrieve both file versions for comparison.'),
});

export type GetFileDiffInput = z.infer<typeof GetFileDiffSchema>;

/**
 * Get file diff
 */
export async function getFileDiff(input: GetFileDiffInput): Promise<ToolResponse> {
  try {
    const params = GetFileDiffSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get PR to verify it exists and get commit info
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

    // Get commit range
    const prCommits = await gitApi.getPullRequestCommits(repoId, params.prId, project);

    if (!prCommits || prCommits.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_COMMITS',
          message: 'No commits found in PR',
        },
      };
    }

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

    // Get diff for specific file
    const diff = await gitApi.getCommitDiffs(
      repoId,
      project,
      true, // diffCommonCommit
      1, // top - just get this file
      0, // skip
      {
        baseVersion: targetCommitId,
        baseVersionType: 0, // Commit
        targetVersion: lastCommitId,
        targetVersionType: 0, // Commit
      }
    );

    if (!diff || !diff.changes) {
      return {
        success: false,
        error: {
          code: 'DIFF_NOT_FOUND',
          message: 'Could not retrieve diff',
        },
      };
    }

    // Find the specific file
    const fileChange = diff.changes.find((c) => c.item?.path === params.filePath);

    if (!fileChange) {
      return {
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File ${params.filePath} not found in PR changes`,
        },
      };
    }

    // Determine change type
    let changeType = 'edit';
    switch (fileChange.changeType) {
      case 1:
        changeType = 'add';
        break;
      case 2:
        changeType = 'edit';
        break;
      case 4:
        changeType = 'delete';
        break;
      case 8:
        changeType = 'rename';
        break;
    }

    return {
      success: true,
      data: {
        filePath: params.filePath,
        changeType,
        format: 'summary',
        message: `File ${changeType === 'add' ? 'added' : changeType === 'delete' ? 'deleted' : changeType === 'rename' ? 'renamed' : 'edited'} in PR`,
        suggestedActions: [
          {
            tool: 'get_file_content',
            params: { prId: params.prId, filePath: params.filePath, includeOriginal: true },
            reason: 'Get original and modified file contents for comparison',
            priority: 'high' as const,
          },
          {
            tool: 'add_comment',
            params: { prId: params.prId, filePath: params.filePath, line: 1 },
            reason: 'Add inline comment on this file',
            priority: 'medium' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_DIFF_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get file diff',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getFileDiffTool = {
  name: 'get_file_diff',
  description:
    'Get change metadata for a specific file in a pull request (change type: add/edit/delete/rename). To compare actual file content, use get_file_content with includeOriginal=true which returns both the original and modified versions side-by-side.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID',
      },
      filePath: {
        type: 'string',
        description: 'Path to the file (e.g., "src/main.ts")',
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
    required: ['prId', 'filePath'],
  },
};
