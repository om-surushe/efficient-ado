/**
 * query_work_items tool
 * Execute a custom WIQL query to find work items
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for query_work_items
 */
export const QueryWorkItemsSchema = z.object({
  wiql: z
    .string()
    .min(10)
    .describe(
      "WIQL SELECT query. Always use @project and @Me built-ins instead of hardcoded values. Example: SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me AND [System.State] = 'Active'"
    ),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  limit: z
    .number()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe('Maximum results (1-200, default: 50)'),
});

export type QueryWorkItemsInput = z.infer<typeof QueryWorkItemsSchema>;

/**
 * Execute a WIQL query
 */
export async function queryWorkItems(input: QueryWorkItemsInput): Promise<ToolResponse> {
  try {
    const params = QueryWorkItemsSchema.parse(input);

    const project = getProject(params.project);
    const witApi = await getWorkItemApi();

    // Validate the query starts with SELECT (WIQL is read-only, but enforce correct intent)
    if (!params.wiql.trim().toUpperCase().startsWith('SELECT')) {
      return {
        success: false,
        error: {
          code: 'INVALID_WIQL',
          message: 'WIQL must be a SELECT query',
          details: {
            hint: "Example: SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.TeamProject] = @project",
          },
        },
      };
    }

    const queryResult = await witApi.queryByWiql(
      { query: params.wiql },
      project,
      undefined,
      undefined,
      params.limit
    );

    if (!queryResult.workItems || queryResult.workItems.length === 0) {
      return {
        success: true,
        data: {
          workItems: [],
          count: 0,
          message: 'No work items matched the query',
        },
      };
    }

    // Fetch full work item details
    const ids = queryResult.workItems.map((wi) => wi.id!);
    const workItems = await witApi.getWorkItems(ids, undefined, undefined, undefined, 0);

    const formatted = workItems.map((wi) => {
      const fields = wi.fields || {};
      return {
        id: wi.id!,
        type: fields['System.WorkItemType'] || 'Unknown',
        title: fields['System.Title'] || 'Untitled',
        state: fields['System.State'] || 'Unknown',
        assignedTo: fields['System.AssignedTo']?.displayName || 'Unassigned',
        priority: fields['Microsoft.VSTS.Common.Priority'],
        areaPath: fields['System.AreaPath'] || '',
        iterationPath: fields['System.IterationPath'] || '',
        changedDate: fields['System.ChangedDate'] || '',
        url: wi._links?.html?.href || '',
      };
    });

    return {
      success: true,
      data: {
        workItems: formatted,
        count: formatted.length,
        suggestedActions:
          formatted.length > 0
            ? [
                {
                  tool: 'get_work_item',
                  params: { id: formatted[0].id },
                  reason: `View details for #${formatted[0].id}: ${formatted[0].title}`,
                  priority: 'medium' as const,
                },
              ]
            : [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'QUERY_FAILED',
        message: error instanceof Error ? error.message : 'Failed to execute WIQL query',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const queryWorkItemsTool = {
  name: 'query_work_items',
  description:
    "Execute a custom WIQL (Work Item Query Language) query to find work items. Use this when list_my_work_items filters are insufficient. Always use @project and @Me built-ins instead of hardcoded values. Example: SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me AND [System.State] = 'Active'",
  inputSchema: {
    type: 'object' as const,
    properties: {
      wiql: {
        type: 'string',
        description:
          'WIQL SELECT query. Use @project and @Me built-ins for safe, portable queries.',
      },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      limit: {
        type: 'number',
        description: 'Maximum results (1-200, default: 50)',
        minimum: 1,
        maximum: 200,
        default: 50,
      },
    },
    required: ['wiql'],
  },
};
