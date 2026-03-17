/**
 * delete_work_item tool
 * Delete a work item (soft delete to recycle bin, or permanent destroy)
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for delete_work_item
 */
export const DeleteWorkItemSchema = z.object({
  id: z.number().describe('Work item ID to delete'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  destroy: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Permanently destroy the work item (cannot be undone). Default: false (soft delete — can be restored from recycle bin)'
    ),
});

export type DeleteWorkItemInput = z.infer<typeof DeleteWorkItemSchema>;

/**
 * Delete a work item
 */
export async function deleteWorkItem(input: DeleteWorkItemInput): Promise<ToolResponse> {
  try {
    const params = DeleteWorkItemSchema.parse(input);

    const project = getProject(params.project);
    const witApi = await getWorkItemApi();

    // Fetch work item details for confirmation info
    let title = 'Unknown';
    let type = 'Unknown';
    try {
      const items = await witApi.getWorkItems([params.id], project);
      if (items?.[0]?.fields) {
        title = items[0].fields['System.Title'] || 'Unknown';
        type = items[0].fields['System.WorkItemType'] || 'Unknown';
      }
    } catch {
      // Continue with deletion even if we can't fetch details
    }

    const deleted = await witApi.deleteWorkItem(params.id, project, params.destroy);

    return {
      success: true,
      data: {
        id: params.id,
        title,
        type,
        permanent: params.destroy,
        ...(deleted?.id && { recycleId: deleted.id }),
        message: params.destroy
          ? `Work item #${params.id} (${type}: ${title}) permanently destroyed`
          : `Work item #${params.id} (${type}: ${title}) moved to recycle bin (can be restored)`,
        suggestedActions: params.destroy
          ? []
          : [
              {
                tool: 'list_my_work_items',
                params: {},
                reason: 'View remaining work items',
                priority: 'low' as const,
              },
            ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DELETE_WORK_ITEM_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete work item',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const deleteWorkItemTool = {
  name: 'delete_work_item',
  description:
    'Delete a work item. By default performs a soft delete (moved to recycle bin, recoverable). Set destroy=true for permanent deletion (irreversible — use with caution). Always confirm with user before permanent deletion.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'number', description: 'Work item ID to delete' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      destroy: {
        type: 'boolean',
        description:
          'Permanently destroy (cannot be undone). Default: false (soft delete to recycle bin)',
        default: false,
      },
    },
    required: ['id'],
  },
};
