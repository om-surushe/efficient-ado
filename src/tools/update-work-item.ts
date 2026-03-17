/**
 * update_work_item tool
 * Update an existing work item
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { ToolResponse } from '../types.js';
import { JsonPatchDocument, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

/**
 * Input schema for update_work_item
 */
export const UpdateWorkItemSchema = z.object({
  id: z.number().describe('Work item ID'),
  title: z.string().optional().describe('New title'),
  description: z.string().optional().describe('New description'),
  state: z.string().optional().describe('New state (Active, Resolved, Closed, etc.)'),
  assignedTo: z.string().optional().describe('Assign to user (display name, email, or "Unassigned")'),
  priority: z.number().min(1).max(4).optional().describe('Priority (1=highest, 4=lowest)'),
  tags: z.string().optional().describe('Tags (comma-separated)'),
  effort: z.number().optional().describe('Story points or effort estimate'),
  remainingWork: z.number().optional().describe('Remaining work hours'),
  completedWork: z.number().optional().describe('Completed work hours'),
  areaPath: z.string().optional().describe('Area path (e.g., "MyProject\\\\Frontend")'),
  iterationPath: z.string().optional().describe('Iteration/sprint path (e.g., "MyProject\\\\Sprint 5")'),
});

export type UpdateWorkItemInput = z.infer<typeof UpdateWorkItemSchema>;

/**
 * Update work item
 */
export async function updateWorkItem(input: UpdateWorkItemInput): Promise<ToolResponse> {
  try {
    const params = UpdateWorkItemSchema.parse(input);

    const witApi = await getWorkItemApi();

    // Build JSON patch document
    const patchDocument: JsonPatchDocument = [];

    if (params.title) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/System.Title',
        value: params.title,
      });
    }

    if (params.description !== undefined) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/System.Description',
        value: params.description,
      });
    }

    if (params.state) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/System.State',
        value: params.state,
      });
    }

    if (params.assignedTo) {
      if (params.assignedTo.toLowerCase() === 'unassigned') {
        patchDocument.push({
          op: Operation.Remove,
          path: '/fields/System.AssignedTo',
        });
      } else {
        patchDocument.push({
          op: Operation.Replace,
          path: '/fields/System.AssignedTo',
          value: params.assignedTo,
        });
      }
    }

    if (params.priority) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: params.priority,
      });
    }

    if (params.tags !== undefined) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/System.Tags',
        value: params.tags,
      });
    }

    if (params.effort !== undefined) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/Microsoft.VSTS.Scheduling.Effort',
        value: params.effort,
      });
    }

    if (params.remainingWork !== undefined) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork',
        value: params.remainingWork,
      });
    }

    if (params.completedWork !== undefined) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork',
        value: params.completedWork,
      });
    }

    if (params.areaPath !== undefined) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/System.AreaPath',
        value: params.areaPath,
      });
    }

    if (params.iterationPath !== undefined) {
      patchDocument.push({
        op: Operation.Replace,
        path: '/fields/System.IterationPath',
        value: params.iterationPath,
      });
    }

    if (patchDocument.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_CHANGES',
          message: 'No fields specified to update',
        },
      };
    }

    // Update work item
    const workItem = await witApi.updateWorkItem(
      undefined, // customHeaders
      patchDocument,
      params.id
    );

    if (!workItem) {
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update work item',
        },
      };
    }

    const fields = workItem.fields || {};

    return {
      success: true,
      data: {
        id: workItem.id!,
        title: fields['System.Title'] || '',
        state: fields['System.State'] || '',
        assignedTo: fields['System.AssignedTo']?.displayName || 'Unassigned',
        message: `✅ Work item #${params.id} updated`,
        changes: patchDocument.length,
        suggestedActions: [
          {
            tool: 'get_work_item',
            params: { id: params.id },
            reason: 'View updated work item',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UPDATE_WORK_ITEM_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update work item',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const updateWorkItemTool = {
  name: 'update_work_item',
  description:
    'Update an existing work item. Can update title, description, state, assignedTo, priority, tags, effort, remainingWork, completedWork. Only specify fields you want to change. Use "Unassigned" to remove assignment. Returns updated work item info.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'number',
        description: 'Work item ID',
      },
      title: {
        type: 'string',
        description: 'New title',
      },
      description: {
        type: 'string',
        description: 'New description',
      },
      state: {
        type: 'string',
        description: 'New state (Active, Resolved, Closed, etc.)',
      },
      assignedTo: {
        type: 'string',
        description: 'Assign to user (display name, email, or "Unassigned")',
      },
      priority: {
        type: 'number',
        description: 'Priority (1=highest, 4=lowest)',
        minimum: 1,
        maximum: 4,
      },
      tags: {
        type: 'string',
        description: 'Tags (comma-separated)',
      },
      effort: {
        type: 'number',
        description: 'Story points or effort estimate',
      },
      remainingWork: {
        type: 'number',
        description: 'Remaining work hours',
      },
      completedWork: {
        type: 'number',
        description: 'Completed work hours',
      },
      areaPath: {
        type: 'string',
        description: 'Area path (e.g., "MyProject\\\\Frontend")',
      },
      iterationPath: {
        type: 'string',
        description: 'Iteration/sprint path (e.g., "MyProject\\\\Sprint 5")',
      },
    },
    required: ['id'],
  },
};
