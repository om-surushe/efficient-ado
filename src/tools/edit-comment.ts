/**
 * edit_comment tool
 * Edit an existing comment in a pull request thread
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for edit_comment
 */
export const EditCommentSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  threadId: z.number().describe('Thread ID containing the comment'),
  commentId: z.number().describe('Comment ID to edit'),
  content: z.string().min(1).describe('New comment content (supports Markdown)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type EditCommentInput = z.infer<typeof EditCommentSchema>;

/**
 * Edit a comment
 */
export async function editComment(input: EditCommentInput): Promise<ToolResponse> {
  try {
    const params = EditCommentSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);
    const gitApi = await getGitApi();

    const updatedComment = await gitApi.updateComment(
      { content: params.content },
      repoId,
      params.prId,
      params.threadId,
      params.commentId,
      project
    );

    return {
      success: true,
      data: {
        commentId: updatedComment.id!,
        threadId: params.threadId,
        prId: params.prId,
        content: updatedComment.content || params.content,
        author: updatedComment.author?.displayName || 'Unknown',
        lastUpdatedDate: updatedComment.lastUpdatedDate?.toISOString() || new Date().toISOString(),
        message: `Comment #${params.commentId} updated`,
        suggestedActions: [
          {
            tool: 'list_comments',
            params: { prId: params.prId },
            reason: 'View all threads',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'EDIT_COMMENT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to edit comment',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const editCommentTool = {
  name: 'edit_comment',
  description:
    'Edit an existing comment in a pull request thread. Only the comment author can edit their own comments (unless you have admin permissions). Supports Markdown.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: { type: 'number', description: 'Pull request ID' },
      threadId: { type: 'number', description: 'Thread ID containing the comment' },
      commentId: { type: 'number', description: 'Comment ID to edit' },
      content: { type: 'string', description: 'New comment content (supports Markdown)' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
    required: ['prId', 'threadId', 'commentId', 'content'],
  },
};
