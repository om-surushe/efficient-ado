/**
 * move_to_sprint tool
 * Move a work item to a specific sprint/iteration
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { ToolResponse } from '../types.js';
import { JsonPatchDocument, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export const MoveToSprintSchema = z.object({
  workItemId: z.number().describe('Work item ID to move'),
  iterationPath: z.string().describe('Full iteration path (e.g., "MyProject\\\\Sprint 5") or use list_sprints to find the path'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
});

export type MoveToSprintInput = z.infer<typeof MoveToSprintSchema>;

export async function moveToSprint(input: MoveToSprintInput): Promise<ToolResponse> {
  try {
    const params = MoveToSprintSchema.parse(input);
    const witApi = await getWorkItemApi();

    const patchDocument: JsonPatchDocument = [
      {
        op: Operation.Replace,
        path: '/fields/System.IterationPath',
        value: params.iterationPath,
      },
    ];

    const workItem = await witApi.updateWorkItem(undefined, patchDocument, params.workItemId);

    if (!workItem) {
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update work item iteration path' },
      };
    }

    const fields = workItem.fields || {};

    return {
      success: true,
      data: {
        id: workItem.id!,
        title: fields['System.Title'] || '',
        iterationPath: fields['System.IterationPath'] || params.iterationPath,
        message: `✅ Work item #${params.workItemId} moved to "${params.iterationPath}"`,
        suggestedActions: [
          {
            tool: 'get_work_item',
            params: { id: params.workItemId },
            reason: 'Verify work item was moved correctly',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'MOVE_TO_SPRINT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to move work item to sprint',
        details: {
          hint: 'Use list_sprints to find the correct iterationPath value',
          error,
        },
      },
    };
  }
}

export const moveToSprintTool = {
  name: 'move_to_sprint',
  description:
    'Move a work item to a specific sprint/iteration by updating its iteration path. Use list_sprints to find available sprint paths. The iterationPath format is "ProjectName\\\\SprintName" (e.g., "MyProject\\\\Sprint 5").',
  inputSchema: {
    type: 'object' as const,
    properties: {
      workItemId: { type: 'number', description: 'Work item ID to move' },
      iterationPath: {
        type: 'string',
        description: 'Full iteration path (e.g., "MyProject\\\\Sprint 5")',
      },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
    },
    required: ['workItemId', 'iterationPath'],
  },
};
