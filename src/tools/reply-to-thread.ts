/**
 * reply_to_thread tool
 * Reply to an existing comment thread
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';
import { threadStatusToNumber, threadNumberToStatus } from '../utils/status-map.js';

/**
 * Input schema for reply_to_thread
 */
export const ReplyToThreadSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  threadId: z.number().describe('Comment thread ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  content: z.string().describe('Reply content (supports markdown)'),
  updateStatus: z
    .enum(['active', 'fixed', 'closed', 'wontFix', 'byDesign', 'pending'])
    .optional()
    .describe('Optionally update thread status when replying'),
});

export type ReplyToThreadInput = z.infer<typeof ReplyToThreadSchema>;

/**
 * Reply to a comment thread
 */
export async function replyToThread(input: ReplyToThreadInput): Promise<ToolResponse> {
  try {
    const params = ReplyToThreadSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get existing thread directly by ID
    const thread = await gitApi.getPullRequestThread(repoId, params.prId, params.threadId, project);

    if (!thread) {
      return {
        success: false,
        error: {
          code: 'THREAD_NOT_FOUND',
          message: `Thread #${params.threadId} not found in PR #${params.prId}`,
        },
      };
    }

    // Create reply comment
    const comment = {
      content: params.content,
      commentType: 1, // Text
      parentCommentId: thread.comments?.[thread.comments.length - 1]?.id || 0,
    };

    const createdComment = await gitApi.createComment(
      comment,
      repoId,
      params.prId,
      params.threadId,
      project
    );

    // Update status if requested
    let statusUpdated = false;
    let newStatus = threadNumberToStatus(thread.status);

    if (params.updateStatus) {
      try {
        const updatedThread = {
          status: threadStatusToNumber(params.updateStatus),
        };

        await gitApi.updateThread(updatedThread, repoId, params.prId, params.threadId, project);
        statusUpdated = true;
        newStatus = params.updateStatus;
      } catch (error) {
        // Status update failed but reply succeeded
      }
    }

    // Get thread info for response
    const isInline = !!thread.threadContext?.filePath;

    return {
      success: true,
      data: {
        threadId: params.threadId,
        commentId: createdComment.id!,
        content: params.content,
        status: {
          current: newStatus,
          updated: statusUpdated,
          previous: statusUpdated ? threadNumberToStatus(thread.status) : newStatus,
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
          totalComments: (thread.comments?.length || 0) + 1,
        },
        message: statusUpdated
          ? `✅ Reply added and thread marked as ${newStatus}`
          : '✅ Reply added to thread',
        suggestedActions: [
          {
            tool: 'list_comments',
            params: { prId: params.prId, status: 'active' },
            reason: 'View remaining active threads',
            priority: 'medium' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'REPLY_FAILED',
        message: error instanceof Error ? error.message : 'Failed to reply to thread',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const replyToThreadTool = {
  name: 'reply_to_thread',
  description:
    'Reply to an existing comment thread in a pull request. Can optionally update the thread status (e.g., mark as "fixed" when replying with a fix). Supports markdown formatting. Use this to respond to code review feedback.',
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
      content: {
        type: 'string',
        description: 'Reply content (supports markdown)',
      },
      updateStatus: {
        type: 'string',
        enum: ['active', 'fixed', 'closed', 'wontFix', 'byDesign', 'pending'],
        description: 'Optionally update thread status when replying',
      },
    },
    required: ['prId', 'threadId', 'content'],
  },
};
