/**
 * get_work_item_comments tool
 * Get comments (discussion) on a work item
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_work_item_comments
 */
export const GetWorkItemCommentsSchema = z.object({
  id: z.number().describe('Work item ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  limit: z
    .number()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe('Maximum comments to return (1-200, default: 50)'),
  skip: z.number().min(0).optional().default(0).describe('Number of comments to skip (for pagination)'),
});

export type GetWorkItemCommentsInput = z.infer<typeof GetWorkItemCommentsSchema>;

/**
 * Get work item comments
 */
export async function getWorkItemComments(input: GetWorkItemCommentsInput): Promise<ToolResponse> {
  try {
    const params = GetWorkItemCommentsSchema.parse(input);

    const project = getProject(params.project);
    const witApi = await getWorkItemApi();

    const result = await witApi.getComments(project, params.id, params.limit, params.skip);

    if (!result || !result.comments || result.comments.length === 0) {
      return {
        success: true,
        data: {
          workItemId: params.id,
          comments: [],
          count: 0,
          message: 'No comments found on this work item',
        },
      };
    }

    const comments = result.comments.map((c) => ({
      id: c.id,
      text: c.text || '',
      createdBy: c.createdBy?.displayName || 'Unknown',
      createdDate: c.createdDate?.toISOString() || '',
      modifiedBy: c.modifiedBy?.displayName,
      modifiedDate: c.modifiedDate?.toISOString(),
      isEdited: !!(c.modifiedDate && c.createdDate && c.modifiedDate > c.createdDate),
    }));

    return {
      success: true,
      data: {
        workItemId: params.id,
        comments,
        count: comments.length,
        totalCount: result.totalCount || comments.length,
        hasMore: (result.totalCount || 0) > params.skip + comments.length,
        pagination: { skip: params.skip, limit: params.limit },
        suggestedActions: [
          {
            tool: 'add_work_item_comment',
            params: { id: params.id, text: '' },
            reason: 'Add a comment to this work item',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_WI_COMMENTS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get work item comments',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getWorkItemCommentsTool = {
  name: 'get_work_item_comments',
  description:
    'Get discussion comments on a work item. Returns comments with author, date, and text. Supports pagination. Use this to read the conversation history on a work item.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'number', description: 'Work item ID' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      limit: {
        type: 'number',
        description: 'Maximum comments to return (1-200, default: 50)',
        minimum: 1,
        maximum: 200,
        default: 50,
      },
      skip: {
        type: 'number',
        description: 'Number of comments to skip (for pagination)',
        minimum: 0,
        default: 0,
      },
    },
    required: ['id'],
  },
};
