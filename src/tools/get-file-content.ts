/**
 * get_file_content tool
 * Get file content from a pull request (original and/or modified)
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_file_content
 */
export const GetFileContentSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  filePath: z.string().describe('Path to the file (e.g., "src/main.ts")'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  includeOriginal: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include original version from target branch (default: false, only modified)'),
  startLine: z.number().optional().describe('Start line number (1-indexed) to limit content'),
  endLine: z.number().optional().describe('End line number (1-indexed) to limit content'),
  maxLines: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .default(500)
    .describe('Maximum lines to return (1-1000, default: 500)'),
});

export type GetFileContentInput = z.infer<typeof GetFileContentSchema>;

/**
 * Get file content
 */
export async function getFileContent(input: GetFileContentInput): Promise<ToolResponse> {
  try {
    const params = GetFileContentSchema.parse(input);

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

    // Get source and target branch commits
    const sourceCommit = pr.lastMergeSourceCommit?.commitId;
    const targetCommit = pr.lastMergeTargetCommit?.commitId;

    if (!sourceCommit) {
      return {
        success: false,
        error: {
          code: 'COMMIT_INFO_MISSING',
          message: 'Could not determine source commit for PR',
        },
      };
    }

    // Get modified file content (from source branch)
    let modifiedContent = '';
    let modifiedExists = true;

    try {
      const modifiedItem = await gitApi.getItem(
        repoId,
        params.filePath,
        project,
        undefined, // scopePath
        undefined, // recursionLevel
        undefined, // includeContentMetadata
        undefined, // latestProcessedChange
        undefined, // download
        sourceCommit // versionDescriptor (commitId)
      );

      if (modifiedItem && modifiedItem.content) {
        modifiedContent = modifiedItem.content;
        // Detect binary files (null bytes indicate non-text content)
        if (modifiedContent.includes('\x00')) {
          return {
            success: false,
            error: {
              code: 'BINARY_FILE',
              message: `File ${params.filePath} is a binary file and cannot be displayed as text`,
              details: { filePath: params.filePath },
            },
          };
        }
      }
    } catch (error) {
      // File might be deleted or not exist
      modifiedExists = false;
    }

    // Get original file content if requested
    let originalContent = '';
    let originalExists = true;

    if (params.includeOriginal && targetCommit) {
      try {
        const originalItem = await gitApi.getItem(
          repoId,
          params.filePath,
          project,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          targetCommit
        );

        if (originalItem && originalItem.content) {
          originalContent = originalItem.content;
        }
      } catch (error) {
        // File might not exist in target (new file)
        originalExists = false;
      }
    }

    // Determine change type
    let changeType = 'edit';
    if (!originalExists && modifiedExists) {
      changeType = 'add';
    } else if (originalExists && !modifiedExists) {
      changeType = 'delete';
    }

    // Process line ranges if specified
    let modifiedLines = modifiedContent.split('\n');
    let originalLines = originalContent.split('\n');

    if (params.startLine || params.endLine) {
      const start = (params.startLine || 1) - 1; // Convert to 0-indexed
      const end = params.endLine || modifiedLines.length;

      modifiedLines = modifiedLines.slice(start, end);
      originalLines = originalLines.slice(start, end);
    }

    // Limit to maxLines
    if (modifiedLines.length > params.maxLines) {
      modifiedLines = modifiedLines.slice(0, params.maxLines);
    }
    if (originalLines.length > params.maxLines) {
      originalLines = originalLines.slice(0, params.maxLines);
    }

    const isTruncated =
      modifiedContent.split('\n').length > params.maxLines ||
      originalContent.split('\n').length > params.maxLines;

    // Build response
    const response: any = {
      filePath: params.filePath,
      changeType,
      modified: {
        exists: modifiedExists,
        content: modifiedLines.join('\n'),
        lines: modifiedLines.length,
        totalLines: modifiedContent.split('\n').length,
      },
    };

    if (params.includeOriginal) {
      response.original = {
        exists: originalExists,
        content: originalLines.join('\n'),
        lines: originalLines.length,
        totalLines: originalContent.split('\n').length,
      };
    }

    response.truncated = isTruncated;

    if (params.startLine || params.endLine) {
      response.lineRange = {
        start: params.startLine || 1,
        end: params.endLine || modifiedLines.length,
      };
    }

    // Suggested actions
    const suggestedActions = [];

    if (isTruncated) {
      suggestedActions.push({
        tool: 'get_file_content',
        params: {
          prId: params.prId,
          filePath: params.filePath,
          maxLines: 1000,
        },
        reason: 'Get full file content (was truncated)',
        priority: 'medium' as const,
      });
    }

    if (modifiedExists) {
      suggestedActions.push({
        tool: 'add_comment',
        params: {
          prId: params.prId,
          filePath: params.filePath,
          line: 1,
        },
        reason: 'Add inline comment on this file',
        priority: 'low' as const,
      });
    }

    return {
      success: true,
      data: {
        ...response,
        message: `✅ File content retrieved (${changeType})`,
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_CONTENT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get file content',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getFileContentTool = {
  name: 'get_file_content',
  description:
    'Get file content from a pull request. Returns modified version and optionally the original version from target branch. Supports line ranges to limit content. Use this to understand file changes in detail or to provide context for inline comments. Files are truncated to maxLines (default: 500) to manage token usage.',
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
      includeOriginal: {
        type: 'boolean',
        description: 'Include original version from target branch (default: false)',
        default: false,
      },
      startLine: {
        type: 'number',
        description: 'Start line number (1-indexed) to limit content',
      },
      endLine: {
        type: 'number',
        description: 'End line number (1-indexed) to limit content',
      },
      maxLines: {
        type: 'number',
        description: 'Maximum lines to return (1-1000, default: 500)',
        minimum: 1,
        maximum: 1000,
        default: 500,
      },
    },
    required: ['prId', 'filePath'],
  },
};
