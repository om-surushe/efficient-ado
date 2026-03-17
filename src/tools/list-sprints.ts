/**
 * list_sprints tool
 * List team iterations/sprints
 */

import { z } from 'zod';
import { getWorkApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const ListSprintsSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  team: z.string().optional().describe('Team name (uses project default team if not specified)'),
  timeframe: z
    .enum(['current', 'past', 'future', 'all'])
    .optional()
    .default('all')
    .describe('Filter by timeframe: current, past, future, or all (default: all)'),
});

export type ListSprintsInput = z.infer<typeof ListSprintsSchema>;

export async function listSprints(input: ListSprintsInput): Promise<ToolResponse> {
  try {
    const params = ListSprintsSchema.parse(input);
    const project = getProject(params.project);
    const workApi = await getWorkApi();

    const teamContext = { project, ...(params.team ? { team: params.team } : {}) };
    const timeframe = params.timeframe === 'all' ? undefined : params.timeframe;

    const iterations = await workApi.getTeamIterations(teamContext as any, timeframe);

    const formatted = (iterations || []).map((it: any) => ({
      id: it.id,
      name: it.name,
      path: it.path,
      startDate: it.attributes?.startDate?.toISOString?.() ?? it.attributes?.startDate,
      finishDate: it.attributes?.finishDate?.toISOString?.() ?? it.attributes?.finishDate,
      timeFrame: it.attributes?.timeFrame,
      url: it.url,
    }));

    const current = formatted.find((it: any) => it.timeFrame === 1); // 1 = current

    return {
      success: true,
      data: {
        sprints: formatted,
        count: formatted.length,
        current: current || null,
        suggestedActions:
          current
            ? [
                {
                  tool: 'get_sprint_backlog',
                  params: { iterationId: current.id },
                  reason: `View work items in current sprint "${current.name}"`,
                  priority: 'high' as const,
                },
              ]
            : [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_SPRINTS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list sprints',
        details: error,
      },
    };
  }
}

export const listSprintsTool = {
  name: 'list_sprints',
  description:
    'List team iterations/sprints. Filter by timeframe: current (active sprint), past (completed), future (upcoming), or all. Returns sprint ID, name, path, start/finish dates, and highlights the current sprint. Use the sprint ID with get_sprint_backlog to view its work items.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      team: { type: 'string', description: 'Team name (uses project default team if not specified)' },
      timeframe: {
        type: 'string',
        enum: ['current', 'past', 'future', 'all'],
        description: 'Filter by timeframe (default: all)',
      },
    },
  },
};
