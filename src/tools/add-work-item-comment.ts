/**
 * add_work_item_comment tool
 * Add a comment to a work item
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for add_work_item_comment
 */
export const AddWorkItemCommentSchema = z.object({
  id: z.number().describe('Work item ID'),
  text: z.string().describe('Comment text'),
});

export type AddWorkItemCommentInput = z.infer<typeof AddWorkItemCommentSchema>;

/**
 * Add work item comment
 */
export async function addWorkItemComment(input: AddWorkItemCommentInput): Promise<ToolResponse> {
  try {
    const params = AddWorkItemCommentSchema.parse(input);

    const witApi = await getWorkItemApi();

    // Add comment
    const comment = await witApi.addComment(
      {
        text: params.text,
      },
      params.id
    );

    if (!comment) {
      return {
        success: false,
        error: {
          code: 'COMMENT_FAILED',
          message: 'Failed to add comment',
        },
      };
    }

    return {
      success: true,
      data: {
        commentId: comment.id!,
        workItemId: params.id,
        text: params.text,
        createdDate: comment.createdDate?.toISOString() || new Date().toISOString(),
        message: `✅ Comment added to work item #${params.id}`,
        suggestedActions: [
          {
            tool: 'get_work_item',
            params: { id: params.id },
            reason: 'View work item with comments',
            priority: 'low' as const,
          },
        ],
      },
    };
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
export const addWorkItemCommentTool = {
  name: 'add_work_item_comment',
  description:
    'Add a comment to a work item. Use this to add status updates, notes, or discussion to tasks, bugs, or user stories. Returns comment ID and creation date.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'number',
        description: 'Work item ID',
      },
      text: {
        type: 'string',
        description: 'Comment text',
      },
    },
    required: ['id', 'text'],
  },
};
