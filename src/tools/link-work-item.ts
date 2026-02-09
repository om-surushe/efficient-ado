/**
 * link_work_item tool
 * Link a work item to a PR or another work item
 */

import { z } from 'zod';
import { getWorkItemApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';
import { JsonPatchDocument, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

/**
 * Input schema for link_work_item
 */
export const LinkWorkItemSchema = z.object({
  id: z.number().describe('Work item ID to link from'),
  linkType: z
    .enum(['pr', 'parent', 'child', 'related'])
    .describe('Type of link: pr (link to PR), parent, child, related (related work item)'),
  targetId: z.number().describe('Target ID (PR ID or work item ID)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name (required for PR links)'),
  comment: z.string().optional().describe('Optional comment for the link'),
});

export type LinkWorkItemInput = z.infer<typeof LinkWorkItemSchema>;

/**
 * Link work item
 */
export async function linkWorkItem(input: LinkWorkItemInput): Promise<ToolResponse> {
  try {
    const params = LinkWorkItemSchema.parse(input);

    const project = getProject(params.project);
    const witApi = await getWorkItemApi();

    // Build link URL based on type
    let linkUrl = '';
    let linkRelation = '';

    switch (params.linkType) {
      case 'pr':
        if (!params.repository) {
          return {
            success: false,
            error: {
              code: 'REPO_REQUIRED',
              message: 'Repository name required for PR links',
            },
          };
        }
        const repoId = getRepo(params.repository);
        linkUrl = `vstfs:///Git/PullRequestId/${project}/${repoId}/${params.targetId}`;
        linkRelation = 'ArtifactLink';
        break;

      case 'parent':
        linkUrl = `${project}/_apis/wit/workItems/${params.targetId}`;
        linkRelation = 'System.LinkTypes.Hierarchy-Reverse';
        break;

      case 'child':
        linkUrl = `${project}/_apis/wit/workItems/${params.targetId}`;
        linkRelation = 'System.LinkTypes.Hierarchy-Forward';
        break;

      case 'related':
        linkUrl = `${project}/_apis/wit/workItems/${params.targetId}`;
        linkRelation = 'System.LinkTypes.Related';
        break;

      default:
        return {
          success: false,
          error: {
            code: 'INVALID_LINK_TYPE',
            message: `Invalid link type: ${params.linkType}`,
          },
        };
    }

    // Build JSON patch document
    const patchDocument: JsonPatchDocument = [
      {
        op: Operation.Add,
        path: '/relations/-',
        value: {
          rel: linkRelation,
          url: linkUrl,
          attributes: {
            comment: params.comment || '',
          },
        },
      },
    ];

    // Update work item with new link
    const workItem = await witApi.updateWorkItem(
      undefined, // customHeaders
      patchDocument,
      params.id
    );

    if (!workItem) {
      return {
        success: false,
        error: {
          code: 'LINK_FAILED',
          message: 'Failed to create link',
        },
      };
    }

    const linkDescription =
      params.linkType === 'pr'
        ? `PR #${params.targetId}`
        : params.linkType === 'parent'
        ? `parent #${params.targetId}`
        : params.linkType === 'child'
        ? `child #${params.targetId}`
        : `work item #${params.targetId}`;

    return {
      success: true,
      data: {
        workItemId: params.id,
        linkType: params.linkType,
        targetId: params.targetId,
        message: `✅ Work item #${params.id} linked to ${linkDescription}`,
        suggestedActions: [
          {
            tool: 'get_work_item',
            params: { id: params.id, includeRelations: true },
            reason: 'View work item with relations',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LINK_WORK_ITEM_FAILED',
        message: error instanceof Error ? error.message : 'Failed to link work item',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const linkWorkItemTool = {
  name: 'link_work_item',
  description:
    'Link a work item to a PR or another work item. Link types: "pr" (link to PR, requires repository), "parent" (set parent), "child" (add child), "related" (related work item). Use this to track work item relationships and link tasks to PRs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'number',
        description: 'Work item ID to link from',
      },
      linkType: {
        type: 'string',
        enum: ['pr', 'parent', 'child', 'related'],
        description: 'Type of link: pr, parent, child, related',
      },
      targetId: {
        type: 'number',
        description: 'Target ID (PR ID or work item ID)',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name (required for PR links)',
      },
      comment: {
        type: 'string',
        description: 'Optional comment for the link',
      },
    },
    required: ['id', 'linkType', 'targetId'],
  },
};
