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
    .enum(['unified', 'summary'])
    .optional()
    .default('unified')
    .describe('Diff format: unified (full diff) or summary (stats only). Default: unified'),
  contextLines: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .default(3)
    .describe('Number of context lines around changes (0-20, default: 3)'),
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

    // For summary format, return just stats
    if (params.format === 'summary') {
      return {
        success: true,
        data: {
          filePath: params.filePath,
          changeType,
          format: 'summary',
          message: `File ${changeType}d in PR`,
          suggestedActions: [
            {
              tool: 'get_file_diff',
              params: { prId: params.prId, filePath: params.filePath, format: 'unified' },
              reason: 'Get full diff with changes',
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
    }

    // For unified format, we need to get actual file contents
    // Note: ADO API doesn't provide unified diff directly, we'd need to:
    // 1. Get original file content
    // 2. Get modified file content
    // 3. Generate diff manually (or use a diff library)
    
    // For now, return a simplified response with file info
    // In a production system, you'd want to implement full unified diff generation

    return {
      success: true,
      data: {
        filePath: params.filePath,
        changeType,
        format: 'unified',
        message: 'Note: Full unified diff generation not yet implemented. Use get_file_content to get file contents.',
        info: {
          note: 'Azure DevOps API does not provide unified diffs directly. To see changes:',
          alternatives: [
            'Use get_file_content to get original and modified versions',
            'Compare versions manually',
            'View in Azure DevOps UI',
          ],
        },
        suggestedActions: [
          {
            tool: 'get_file_content',
            params: { prId: params.prId, filePath: params.filePath, includeOriginal: true },
            reason: 'Get original and modified file contents',
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
    'Get the diff for a specific file in a pull request. Returns change information. Note: Azure DevOps API has limited diff support - use get_file_content to get original and modified versions for comparison. Useful for understanding what changed in a specific file.',
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
      format: {
        type: 'string',
        enum: ['unified', 'summary'],
        description: 'Diff format: unified (full diff) or summary (stats only). Default: unified',
        default: 'unified',
      },
      contextLines: {
        type: 'number',
        description: 'Number of context lines around changes (0-20, default: 3)',
        minimum: 0,
        maximum: 20,
        default: 3,
      },
    },
    required: ['prId', 'filePath'],
  },
};
