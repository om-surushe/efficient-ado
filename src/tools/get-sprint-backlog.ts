/**
 * get_sprint_backlog tool
 * Get work items in a specific sprint/iteration
 */

import { z } from 'zod';
import { getWorkApi, getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const GetSprintBacklogSchema = z.object({
  iterationId: z.string().describe('Sprint/iteration ID (from list_sprints)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  team: z.string().optional().describe('Team name (uses project default team if not specified)'),
});

export type GetSprintBacklogInput = z.infer<typeof GetSprintBacklogSchema>;

export async function getSprintBacklog(input: GetSprintBacklogInput): Promise<ToolResponse> {
  try {
    const params = GetSprintBacklogSchema.parse(input);
    const project = getProject(params.project);
    const workApi = await getWorkApi();
    const witApi = await getWorkItemApi();

    const teamContext = { project, ...(params.team ? { team: params.team } : {}) };

    const iterationWorkItems = await workApi.getIterationWorkItems(teamContext as any, params.iterationId);

    const workItemRefs = iterationWorkItems?.workItemRelations || [];
    const ids = workItemRefs
      .map((ref: any) => ref.target?.id)
      .filter((id: any): id is number => typeof id === 'number');

    if (ids.length === 0) {
      return {
        success: true,
        data: {
          iterationId: params.iterationId,
          workItems: [],
          count: 0,
          message: 'No work items found in this sprint',
        },
      };
    }

    const fullItems = await witApi.getWorkItems(ids, project, undefined, undefined, 0);

    const formatted = (fullItems || []).map((wi: any) => {
      const fields = wi.fields || {};
      return {
        id: wi.id,
        type: fields['System.WorkItemType'] || 'Unknown',
        title: fields['System.Title'] || 'Untitled',
        state: fields['System.State'] || 'Unknown',
        assignedTo: fields['System.AssignedTo']?.displayName || 'Unassigned',
        priority: fields['Microsoft.VSTS.Common.Priority'],
        effort: fields['Microsoft.VSTS.Scheduling.Effort'] ?? fields['Microsoft.VSTS.Scheduling.StoryPoints'],
        remainingWork: fields['Microsoft.VSTS.Scheduling.RemainingWork'],
        areaPath: fields['System.AreaPath'],
        url: wi._links?.html?.href || '',
      };
    });

    // Group by state for summary
    const byState = formatted.reduce((acc: any, wi: any) => {
      acc[wi.state] = (acc[wi.state] || 0) + 1;
      return acc;
    }, {});

    const byType = formatted.reduce((acc: any, wi: any) => {
      acc[wi.type] = (acc[wi.type] || 0) + 1;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        iterationId: params.iterationId,
        workItems: formatted,
        count: formatted.length,
        summary: { byState, byType },
        suggestedActions:
          formatted.length > 0
            ? [
                {
                  tool: 'get_work_item',
                  params: { id: formatted[0].id },
                  reason: `View details for work item #${formatted[0].id}`,
                  priority: 'low' as const,
                },
              ]
            : [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_SPRINT_BACKLOG_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get sprint backlog',
        details: error,
      },
    };
  }
}

export const getSprintBacklogTool = {
  name: 'get_sprint_backlog',
  description:
    'Get all work items in a sprint/iteration. Requires iterationId from list_sprints. Returns work items with title, type, state, assignee, priority, and effort. Includes summary grouped by state and type.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      iterationId: { type: 'string', description: 'Sprint/iteration ID (from list_sprints)' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      team: { type: 'string', description: 'Team name (uses project default team if not specified)' },
    },
    required: ['iterationId'],
  },
};
