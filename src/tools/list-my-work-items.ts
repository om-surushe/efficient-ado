/**
 * list_my_work_items tool
 * List work items assigned to current user
 */

import { z } from 'zod';
import { getWorkItemApi, getClient } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for list_my_work_items
 */
export const ListMyWorkItemsSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  state: z
    .enum(['Active', 'New', 'Resolved', 'Closed', 'All'])
    .optional()
    .default('Active')
    .describe('Filter by state (default: Active)'),
  type: z
    .string()
    .optional()
    .describe('Filter by work item type (Task, Bug, User Story, etc.)'),
  limit: z.number().min(1).max(200).optional().default(50).describe('Maximum results (1-200, default: 50)'),
});

export type ListMyWorkItemsInput = z.infer<typeof ListMyWorkItemsSchema>;

/**
 * List my work items
 */
export async function listMyWorkItems(input: ListMyWorkItemsInput): Promise<ToolResponse> {
  try {
    const params = ListMyWorkItemsSchema.parse(input);

    const project = getProject(params.project);
    const witApi = await getWorkItemApi();

    // Get current user
    const connection = getClient();
    const connectionData = await connection.connect();
    const currentUser = connectionData.authenticatedUser?.displayName || '@Me';

    // Build WIQL query
    let stateFilter = '';
    if (params.state !== 'All') {
      stateFilter = `AND [State] = '${params.state}'`;
    }

    let typeFilter = '';
    if (params.type) {
      typeFilter = `AND [Work Item Type] = '${params.type}'`;
    }

    const wiql = `
      SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo], [System.ChangedDate]
      FROM WorkItems
      WHERE [System.TeamProject] = '${project}'
        AND [System.AssignedTo] = '${currentUser}'
        ${stateFilter}
        ${typeFilter}
      ORDER BY [System.ChangedDate] DESC
    `;

    // Execute query
    const queryResult = await witApi.queryByWiql(
      {
        query: wiql,
      },
      project,
      undefined, // team
      undefined, // timePrecision
      params.limit
    );

    if (!queryResult.workItems || queryResult.workItems.length === 0) {
      return {
        success: true,
        data: {
          workItems: [],
          count: 0,
          message: 'No work items found',
          filters: {
            project,
            state: params.state,
            type: params.type,
          },
        },
      };
    }

    // Get work item IDs
    const ids = queryResult.workItems.map((wi) => wi.id!);

    // Get full work items
    const workItems = await witApi.getWorkItems(
      ids,
      undefined, // fields
      undefined, // asOf
      0 // expand (None)
    );

    // Format work items
    const formattedItems = workItems.map((wi) => {
      const fields = wi.fields || {};
      return {
        id: wi.id!,
        type: fields['System.WorkItemType'] || 'Unknown',
        title: fields['System.Title'] || 'Untitled',
        state: fields['System.State'] || 'Unknown',
        priority: fields['Microsoft.VSTS.Common.Priority'],
        changedDate: fields['System.ChangedDate'] || '',
        url: wi._links?.html?.href || '',
      };
    });

    // Group by state
    const byState: Record<string, number> = {};
    formattedItems.forEach((item) => {
      byState[item.state] = (byState[item.state] || 0) + 1;
    });

    // Group by type
    const byType: Record<string, number> = {};
    formattedItems.forEach((item) => {
      byType[item.type] = (byType[item.type] || 0) + 1;
    });

    // Suggested actions
    const suggestedActions = [];

    if (formattedItems.length > 0) {
      const firstItem = formattedItems[0];
      suggestedActions.push({
        tool: 'get_work_item',
        params: { id: firstItem.id },
        reason: `View details for #${firstItem.id}: ${firstItem.title}`,
        priority: 'high' as const,
      });
    }

    return {
      success: true,
      data: {
        workItems: formattedItems,
        count: formattedItems.length,
        summary: {
          total: formattedItems.length,
          byState,
          byType,
        },
        filters: {
          project,
          state: params.state,
          type: params.type,
        },
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_WORK_ITEMS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list work items',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const listMyWorkItemsTool = {
  name: 'list_my_work_items',
  description:
    'List work items assigned to current user. Can filter by state (Active/New/Resolved/Closed/All) and type (Task/Bug/User Story/etc). Returns summary with counts by state and type. Use this to see what tasks you need to work on.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      state: {
        type: 'string',
        enum: ['Active', 'New', 'Resolved', 'Closed', 'All'],
        description: 'Filter by state (default: Active)',
        default: 'Active',
      },
      type: {
        type: 'string',
        description: 'Filter by work item type (Task, Bug, User Story, etc.)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-200, default: 50)',
        minimum: 1,
        maximum: 200,
        default: 50,
      },
    },
  },
};
