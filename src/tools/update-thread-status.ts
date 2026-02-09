/**
 * update_thread_status tool
 * Update the status of a comment thread (mark as resolved, etc.)
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse, ThreadStatus } from '../types.js';

/**
 * Input schema for update_thread_status
 */
export const UpdateThreadStatusSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  threadId: z.number().describe('Comment thread ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  status: z
    .enum(['active', 'fixed', 'closed', 'wontFix', 'byDesign', 'pending'])
    .describe(
      'New thread status: active (reopen), fixed (resolved), closed, wontFix (acknowledged but not changing), byDesign (as intended), pending (under review)'
    ),
});

export type UpdateThreadStatusInput = z.infer<typeof UpdateThreadStatusSchema>;

/**
 * Map status string to ADO number
 */
function mapStatusToNumber(status: string): number {
  switch (status) {
    case 'active':
      return 1;
    case 'fixed':
      return 2;
    case 'wontFix':
      return 3;
    case 'closed':
      return 4;
    case 'byDesign':
      return 5;
    case 'pending':
      return 6;
    default:
      return 1;
  }
}

/**
 * Map ADO number to status string
 */
function mapNumberToStatus(status: number | undefined): ThreadStatus {
  switch (status) {
    case 1:
      return 'active';
    case 2:
      return 'fixed';
    case 3:
      return 'wontFix';
    case 4:
      return 'closed';
    case 5:
      return 'byDesign';
    case 6:
      return 'pending';
    default:
      return 'active';
  }
}

/**
 * Update thread status
 */
export async function updateThreadStatus(input: UpdateThreadStatusInput): Promise<ToolResponse> {
  try {
    const params = UpdateThreadStatusSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get existing thread first
    const threads = await gitApi.getThreads(repoId, params.prId, project);
    const thread = threads.find((t) => t.id === params.threadId);

    if (!thread) {
      return {
        success: false,
        error: {
          code: 'THREAD_NOT_FOUND',
          message: `Thread #${params.threadId} not found in PR #${params.prId}`,
        },
      };
    }

    const oldStatus = mapNumberToStatus(thread.status);

    // Don't update if already at target status
    if (oldStatus === params.status) {
      return {
        success: true,
        data: {
          threadId: params.threadId,
          status: {
            current: params.status,
            previous: oldStatus,
            changed: false,
          },
          message: `Thread is already ${params.status}`,
        },
      };
    }

    // Update status
    const updatedThread = {
      status: mapStatusToNumber(params.status),
    };

    await gitApi.updateThread(updatedThread, repoId, params.prId, params.threadId, project);

    // Get thread info for response
    const isInline = !!thread.threadContext?.filePath;
    const firstComment = thread.comments?.[0];

    return {
      success: true,
      data: {
        threadId: params.threadId,
        status: {
          current: params.status,
          previous: oldStatus,
          changed: true,
        },
        threadInfo: {
          type: isInline ? 'inline' : 'general',
          location: isInline
            ? {
                filePath: thread.threadContext!.filePath!,
                line:
                  thread.threadContext?.rightFileStart?.line ||
                  thread.threadContext?.leftFileStart?.line ||
                  0,
              }
            : null,
          preview: firstComment?.content?.substring(0, 100) || '',
          totalComments: thread.comments?.length || 0,
        },
        message: `✅ Thread status updated: ${oldStatus} → ${params.status}`,
        suggestedActions: [
          {
            tool: 'list_comments',
            params: { prId: params.prId, status: 'active' },
            reason: 'Check remaining active threads',
            priority: 'medium' as const,
          },
          {
            tool: 'check_merge_readiness',
            params: { prId: params.prId },
            reason: 'Verify if PR is ready to merge after resolving threads',
            priority: 'high' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UPDATE_STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update thread status',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const updateThreadStatusTool = {
  name: 'update_thread_status',
  description:
    'Update the status of a comment thread. Use "fixed" to mark as resolved, "active" to reopen, "wontFix" to acknowledge but not change, "byDesign" for intentional behavior, etc. This is useful for managing review feedback lifecycle.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID',
      },
      threadId: {
        type: 'number',
        description: 'Comment thread ID',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      status: {
        type: 'string',
        enum: ['active', 'fixed', 'closed', 'wontFix', 'byDesign', 'pending'],
        description:
          'New status: active (reopen), fixed (resolved), closed, wontFix, byDesign, pending',
      },
    },
    required: ['prId', 'threadId', 'status'],
  },
};
