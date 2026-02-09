/**
 * update_pr tool
 * Update pull request properties
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for update_pr
 */
export const UpdatePRSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  title: z.string().optional().describe('New PR title'),
  description: z.string().optional().describe('New PR description (supports Markdown)'),
  isDraft: z.boolean().optional().describe('Set draft status'),
  autoComplete: z.boolean().optional().describe('Enable/disable auto-complete'),
  deleteSourceBranch: z
    .boolean()
    .optional()
    .describe('Delete source branch after merge (requires autoComplete)'),
});

export type UpdatePRInput = z.infer<typeof UpdatePRSchema>;

/**
 * Update a pull request
 */
export async function updatePr(input: UpdatePRInput): Promise<ToolResponse> {
  try {
    const params = UpdatePRSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Build update object
    const updateData: any = {};

    if (params.title !== undefined) {
      updateData.title = params.title;
    }

    if (params.description !== undefined) {
      updateData.description = params.description;
    }

    if (params.isDraft !== undefined) {
      updateData.isDraft = params.isDraft;
    }

    // Handle auto-complete
    if (params.autoComplete !== undefined) {
      if (params.autoComplete) {
        const { getClient } = await import('../client.js');
        const connection = getClient();
        const connectionData = await connection.connect();
        const currentUserId = connectionData.authenticatedUser?.id;

        if (!currentUserId) {
          return {
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'Could not determine current user ID for auto-complete',
            },
          };
        }

        updateData.autoCompleteSetBy = {
          id: currentUserId,
        };
        updateData.completionOptions = {
          deleteSourceBranch: params.deleteSourceBranch || false,
        };
      } else {
        // Disable auto-complete
        updateData.autoCompleteSetBy = undefined;
      }
    } else if (params.deleteSourceBranch !== undefined) {
      // Only update deleteSourceBranch
      updateData.completionOptions = {
        deleteSourceBranch: params.deleteSourceBranch,
      };
    }

    // Check if there are any updates
    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_UPDATES',
          message: 'No updates specified. Provide at least one field to update.',
        },
        suggestedActions: ['Specify title, description, isDraft, autoComplete, or deleteSourceBranch'],
      };
    }

    // Update PR
    const pr = await gitApi.updatePullRequest(updateData, repoId, params.prId, project);

    return {
      success: true,
      data: {
        id: pr.pullRequestId,
        title: pr.title,
        status: pr.status,
        isDraft: pr.isDraft,
        url: `https://dev.azure.com/${pr.repository?.project?.name}/_git/${pr.repository?.name}/pullrequest/${pr.pullRequestId}`,
        description: pr.description,
        hasAutoComplete: !!pr.autoCompleteSetBy,
        deleteSourceBranch: pr.completionOptions?.deleteSourceBranch,
        sourceBranch: pr.sourceRefName?.replace('refs/heads/', ''),
        targetBranch: pr.targetRefName?.replace('refs/heads/', ''),
      },
      suggestedActions: ['Use get_pr to see full updated state', 'Use start_review to review changes'],
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'UPDATE_PR_FAILED',
        message: error.message || 'Failed to update PR',
      },
      suggestedActions: ['Verify PR exists using get_pr', 'Check PR is not already completed or abandoned'],
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const updatePrTool = {
  name: 'update_pr',
  description:
    'Update pull request properties. Can change title, description, draft status, and auto-complete settings. Use this to modify PR metadata after creation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      title: {
        type: 'string',
        description: 'New PR title',
      },
      description: {
        type: 'string',
        description: 'New PR description (supports Markdown)',
      },
      isDraft: {
        type: 'boolean',
        description: 'Set draft status',
      },
      autoComplete: {
        type: 'boolean',
        description: 'Enable/disable auto-complete',
      },
      deleteSourceBranch: {
        type: 'boolean',
        description: 'Delete source branch after merge (requires autoComplete)',
      },
    },
    required: ['prId'],
  },
};
