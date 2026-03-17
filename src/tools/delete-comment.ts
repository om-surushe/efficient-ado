/**
 * delete_comment tool
 * Delete a comment from a pull request thread
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for delete_comment
 */
export const DeleteCommentSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  threadId: z.number().describe('Thread ID containing the comment'),
  commentId: z.number().describe('Comment ID to delete'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type DeleteCommentInput = z.infer<typeof DeleteCommentSchema>;

/**
 * Delete a comment
 */
export async function deleteComment(input: DeleteCommentInput): Promise<ToolResponse> {
  try {
    const params = DeleteCommentSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);
    const gitApi = await getGitApi();

    await gitApi.deleteComment(repoId, params.prId, params.threadId, params.commentId, project);

    return {
      success: true,
      data: {
        commentId: params.commentId,
        threadId: params.threadId,
        prId: params.prId,
        message: `Comment #${params.commentId} deleted`,
        suggestedActions: [
          {
            tool: 'list_comments',
            params: { prId: params.prId },
            reason: 'View remaining threads',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DELETE_COMMENT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete comment',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const deleteCommentTool = {
  name: 'delete_comment',
  description:
    'Delete a comment from a pull request thread. Only the comment author or admins can delete comments. This action cannot be undone.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: { type: 'number', description: 'Pull request ID' },
      threadId: { type: 'number', description: 'Thread ID containing the comment' },
      commentId: { type: 'number', description: 'Comment ID to delete' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
    required: ['prId', 'threadId', 'commentId'],
  },
};
