/**
 * add_comment tool
 * Add general or inline comment to a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for add_comment
 */
export const AddCommentSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  content: z.string().describe('Comment content (supports markdown)'),
  // For inline comments
  filePath: z.string().optional().describe('File path for inline comment (e.g., "src/main.ts")'),
  line: z.number().optional().describe('Start line number for inline comment (1-indexed)'),
  endLine: z.number().optional().describe('End line number for inline comment (defaults to same as line for single-line comments)'),
  lineOffset: z.number().optional().default(1).describe('Column offset for start of selection (1-indexed, default: 1)'),
  endLineOffset: z.number().optional().default(1).describe('Column offset for end of selection (1-indexed, default: 1)'),
  isRightSide: z
    .boolean()
    .optional()
    .default(true)
    .describe('Comment on right side (modified) vs left side (original). Default: true (right/modified)'),
});

export type AddCommentInput = z.infer<typeof AddCommentSchema>;

/**
 * Add comment to PR
 */
export async function addComment(input: AddCommentInput): Promise<ToolResponse> {
  try {
    const params = AddCommentSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Determine if inline or general comment
    const isInline = !!(params.filePath && params.line);

    if (isInline) {
      // Inline comment - requires file context with both start AND end positions
      const startLine = params.line!;
      const endLine = params.endLine ?? startLine;
      const startOffset = params.lineOffset ?? 1;
      const endOffset = params.endLineOffset ?? 1;

      const thread: any = {
        comments: [
          {
            content: params.content,
            commentType: 1, // Text
          },
        ],
        status: 1, // Active
        threadContext: {
          filePath: params.filePath!,
          rightFileStart: params.isRightSide
            ? { line: startLine, offset: startOffset }
            : undefined,
          rightFileEnd: params.isRightSide
            ? { line: endLine, offset: endOffset }
            : undefined,
          leftFileStart: !params.isRightSide
            ? { line: startLine, offset: startOffset }
            : undefined,
          leftFileEnd: !params.isRightSide
            ? { line: endLine, offset: endOffset }
            : undefined,
        },
      };

      const createdThread = await gitApi.createThread(thread, repoId, params.prId, project);

      return {
        success: true,
        data: {
          threadId: createdThread.id!,
          commentId: createdThread.comments?.[0]?.id || 0,
          type: 'inline',
          content: params.content,
          location: {
            filePath: params.filePath,
            line: params.line,
            side: params.isRightSide ? 'right (modified)' : 'left (original)',
          },
          status: 'active',
          url: `${createdThread.pullRequestThreadContext?.pullRequest?.repository?.webUrl}/pullrequest/${params.prId}?_a=files&path=${params.filePath}`,
          message: `✅ Inline comment added on ${params.filePath} line ${params.line}`,
          suggestedActions: [
            {
              tool: 'get_pr',
              params: { prId: params.prId, level: 'standard', include: ['comments'] },
              reason: 'View updated PR with comments',
              priority: 'low' as const,
            },
          ],
        },
      };
    } else {
      // General comment
      const thread: any = {
        comments: [
          {
            content: params.content,
            commentType: 1, // Text
          },
        ],
        status: 1, // Active
      };

      const createdThread = await gitApi.createThread(thread, repoId, params.prId, project);

      return {
        success: true,
        data: {
          threadId: createdThread.id!,
          commentId: createdThread.comments?.[0]?.id || 0,
          type: 'general',
          content: params.content,
          status: 'active',
          message: '✅ General comment added to PR',
          suggestedActions: [
            {
              tool: 'get_pr',
              params: { prId: params.prId, level: 'standard', include: ['comments'] },
              reason: 'View updated PR with comments',
              priority: 'low' as const,
            },
          ],
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ADD_COMMENT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to add comment',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const addCommentTool = {
  name: 'add_comment',
  description:
    'Add a comment to a pull request. General comment: provide only content. Inline comment: provide filePath + line (start line, 1-indexed); optionally endLine for a range and isRightSide=false for original side. Both rightFileStart and rightFileEnd are sent to ADO for proper text anchoring. Supports markdown. Returns thread ID and comment ID.',
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
      content: {
        type: 'string',
        description: 'Comment content (supports markdown)',
      },
      filePath: {
        type: 'string',
        description: 'File path for inline comment (e.g., "src/main.ts")',
      },
      line: {
        type: 'number',
        description: 'Start line number for inline comment (1-indexed)',
      },
      endLine: {
        type: 'number',
        description: 'End line number for inline comment (defaults to same as line for single-line)',
      },
      lineOffset: {
        type: 'number',
        description: 'Column offset for start of selection (1-indexed, default: 1)',
        default: 1,
      },
      endLineOffset: {
        type: 'number',
        description: 'Column offset for end of selection (1-indexed, default: 1)',
        default: 1,
      },
      isRightSide: {
        type: 'boolean',
        description:
          'Comment on right side (modified) vs left side (original). Default: true (right/modified)',
        default: true,
      },
    },
    required: ['prId', 'content'],
  },
};
