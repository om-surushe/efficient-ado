/**
 * get_work_item tool
 * Get a work item by ID
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_work_item
 */
export const GetWorkItemSchema = z.object({
  id: z.number().describe('Work item ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  includeRelations: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include related work items (parent, children, links)'),
});

export type GetWorkItemInput = z.infer<typeof GetWorkItemSchema>;

/**
 * Get work item
 */
export async function getWorkItem(input: GetWorkItemInput): Promise<ToolResponse> {
  try {
    const params = GetWorkItemSchema.parse(input);

    const project = getProject(params.project);
    const witApi = await getWorkItemApi();

    // Get work item
    const workItem = await witApi.getWorkItem(
      params.id,
      undefined, // fields
      undefined, // asOf
      params.includeRelations ? 1 : 0 // expand (0=None, 1=Relations)
    );

    if (!workItem) {
      return {
        success: false,
        error: {
          code: 'WORK_ITEM_NOT_FOUND',
          message: `Work item #${params.id} not found`,
        },
      };
    }

    const fields = workItem.fields || {};

    // Extract key fields
    const workItemData = {
      id: workItem.id!,
      type: fields['System.WorkItemType'] || 'Unknown',
      title: fields['System.Title'] || 'Untitled',
      state: fields['System.State'] || 'Unknown',
      assignedTo: fields['System.AssignedTo']?.displayName || 'Unassigned',
      createdBy: fields['System.CreatedBy']?.displayName || 'Unknown',
      createdDate: fields['System.CreatedDate'] || '',
      changedDate: fields['System.ChangedDate'] || '',
      description: fields['System.Description'] || '',
      tags: fields['System.Tags'] || '',
      priority: fields['Microsoft.VSTS.Common.Priority'],
      effort: fields['Microsoft.VSTS.Scheduling.Effort'],
      remainingWork: fields['Microsoft.VSTS.Scheduling.RemainingWork'],
      originalEstimate: fields['Microsoft.VSTS.Scheduling.OriginalEstimate'],
      completedWork: fields['Microsoft.VSTS.Scheduling.CompletedWork'],
      url: workItem._links?.html?.href || '',
    };

    // Get relations if requested
    let relations: any[] = [];
    if (params.includeRelations && workItem.relations) {
      relations = workItem.relations.map((rel) => ({
        type: rel.rel || '',
        url: rel.url || '',
        title: rel.attributes?.name || '',
      }));
    }

    // Suggested actions
    const suggestedActions = [];

    if (workItemData.state !== 'Closed' && workItemData.state !== 'Done') {
      suggestedActions.push({
        tool: 'update_work_item',
        params: { id: params.id, state: 'Done' },
        reason: 'Mark work item as done',
        priority: 'medium' as const,
      });
    }

    if (workItemData.assignedTo === 'Unassigned') {
      suggestedActions.push({
        tool: 'update_work_item',
        params: { id: params.id, assignedTo: 'me' },
        reason: 'Assign to yourself',
        priority: 'low' as const,
      });
    }

    suggestedActions.push({
      tool: 'add_work_item_comment',
      params: { id: params.id, text: 'Status update...' },
      reason: 'Add a comment',
      priority: 'low' as const,
    });

    return {
      success: true,
      data: {
        workItem: workItemData,
        relations: params.includeRelations ? relations : undefined,
        message: `✅ Work item #${params.id} retrieved`,
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_WORK_ITEM_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get work item',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getWorkItemTool = {
  name: 'get_work_item',
  description:
    'Get a work item by ID. Returns type, title, state, assigned to, dates, description, and optionally related items. Use this to check task status or get details before updating.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'number',
        description: 'Work item ID',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      includeRelations: {
        type: 'boolean',
        description: 'Include related work items (parent, children, links)',
        default: false,
      },
    },
    required: ['id'],
  },
};
