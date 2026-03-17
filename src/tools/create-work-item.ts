/**
 * create_work_item tool
 * Create a new work item
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';
import { JsonPatchDocument, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

/**
 * Input schema for create_work_item
 */
export const CreateWorkItemSchema = z.object({
  type: z
    .string()
    .describe('Work item type: Task, Bug, User Story, Feature, Epic, Issue, etc.'),
  title: z.string().describe('Work item title'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  description: z.string().optional().describe('Description/details'),
  assignedTo: z.string().optional().describe('Assign to user (display name or email)'),
  state: z.string().optional().describe('Initial state (New, Active, etc.)'),
  priority: z.number().min(1).max(4).optional().describe('Priority (1=highest, 4=lowest)'),
  tags: z.string().optional().describe('Tags (comma-separated)'),
  parentId: z.number().optional().describe('Parent work item ID (for creating child tasks)'),
  effort: z.number().optional().describe('Story points or effort estimate'),
  remainingWork: z.number().optional().describe('Remaining work hours'),
  areaPath: z.string().optional().describe('Area path (e.g., "MyProject\\\\Frontend")'),
  iterationPath: z.string().optional().describe('Iteration/sprint path (e.g., "MyProject\\\\Sprint 5")'),
});

export type CreateWorkItemInput = z.infer<typeof CreateWorkItemSchema>;

/**
 * Create work item
 */
export async function createWorkItem(input: CreateWorkItemInput): Promise<ToolResponse> {
  try {
    const params = CreateWorkItemSchema.parse(input);

    const project = getProject(params.project);
    const witApi = await getWorkItemApi();

    // Build JSON patch document
    const patchDocument: JsonPatchDocument = [];

    // Required fields
    patchDocument.push({
      op: Operation.Add,
      path: '/fields/System.Title',
      value: params.title,
    });

    // Optional fields
    if (params.description) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/System.Description',
        value: params.description,
      });
    }

    if (params.assignedTo) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/System.AssignedTo',
        value: params.assignedTo,
      });
    }

    if (params.state) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/System.State',
        value: params.state,
      });
    }

    if (params.priority) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: params.priority,
      });
    }

    if (params.tags) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/System.Tags',
        value: params.tags,
      });
    }

    if (params.effort) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/Microsoft.VSTS.Scheduling.Effort',
        value: params.effort,
      });
    }

    if (params.remainingWork) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork',
        value: params.remainingWork,
      });
    }

    if (params.areaPath) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/System.AreaPath',
        value: params.areaPath,
      });
    }

    if (params.iterationPath) {
      patchDocument.push({
        op: Operation.Add,
        path: '/fields/System.IterationPath',
        value: params.iterationPath,
      });
    }

    // Add parent link if specified
    if (params.parentId) {
      patchDocument.push({
        op: Operation.Add,
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: `${project}/_apis/wit/workItems/${params.parentId}`,
          attributes: {
            comment: 'Child of parent work item',
          },
        },
      });
    }

    // Create work item
    const workItem = await witApi.createWorkItem(
      undefined, // customHeaders
      patchDocument,
      project,
      params.type
    );

    if (!workItem || !workItem.id) {
      return {
        success: false,
        error: {
          code: 'CREATE_FAILED',
          message: 'Failed to create work item',
        },
      };
    }

    const fields = workItem.fields || {};

    return {
      success: true,
      data: {
        id: workItem.id,
        type: params.type,
        title: params.title,
        state: fields['System.State'] || 'New',
        assignedTo: fields['System.AssignedTo']?.displayName || 'Unassigned',
        url: workItem._links?.html?.href || '',
        message: `✅ ${params.type} #${workItem.id} created`,
        suggestedActions: [
          {
            tool: 'get_work_item',
            params: { id: workItem.id },
            reason: 'View created work item',
            priority: 'medium' as const,
          },
          {
            tool: 'add_work_item_comment',
            params: { id: workItem.id, text: 'Initial comment...' },
            reason: 'Add details or notes',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'CREATE_WORK_ITEM_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create work item',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const createWorkItemTool = {
  name: 'create_work_item',
  description:
    'Create a new work item (Task, Bug, User Story, etc). Specify type and title (required), plus optional fields like description, assignedTo, state, priority, tags, effort, remainingWork. Can link to parent by specifying parentId. Returns created work item ID and details.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        description: 'Work item type: Task, Bug, User Story, Feature, Epic, Issue, etc.',
      },
      title: {
        type: 'string',
        description: 'Work item title',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      description: {
        type: 'string',
        description: 'Description/details',
      },
      assignedTo: {
        type: 'string',
        description: 'Assign to user (display name or email)',
      },
      state: {
        type: 'string',
        description: 'Initial state (New, Active, etc.)',
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
      parentId: {
        type: 'number',
        description: 'Parent work item ID (for creating child tasks)',
      },
      effort: {
        type: 'number',
        description: 'Story points or effort estimate',
      },
      remainingWork: {
        type: 'number',
        description: 'Remaining work hours',
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
    required: ['type', 'title'],
  },
};
