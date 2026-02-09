/**
 * address_comment tool (composite)
 * Reply to a comment thread and update its status in one call
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for address_comment
 */
export const AddressCommentSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  threadId: z.number().describe('Thread ID to reply to'),
  reply: z.string().describe('Reply message (supports Markdown)'),
  status: z
    .enum(['active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending'])
    .optional()
    .describe('New thread status (default: fixed)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type AddressCommentInput = z.infer<typeof AddressCommentSchema>;

/**
 * Map friendly status names to ADO status codes
 */
function mapStatus(status: string): number {
  switch (status.toLowerCase()) {
    case 'active':
      return 1;
    case 'fixed':
      return 2;
    case 'wontfix':
      return 3;
    case 'closed':
      return 4;
    case 'bydesign':
      return 5;
    case 'pending':
      return 6;
    default:
      return 2; // Default to "fixed"
  }
}

/**
 * Address a comment (reply + update status)
 */
export async function addressComment(input: AddressCommentInput): Promise<ToolResponse> {
  try {
    const params = AddressCommentSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get current thread
    const currentThread = await gitApi.getPullRequestThread(repoId, params.prId, params.threadId, project);

    if (!currentThread) {
      return {
        success: false,
        error: {
          code: 'THREAD_NOT_FOUND',
          message: `Thread #${params.threadId} not found in PR #${params.prId}`,
        },
      };
    }

    // Step 1: Add reply
    const updatedThread = await gitApi.createComment(
      {
        content: params.reply,
        commentType: 1, // text
      },
      repoId,
      params.prId,
      params.threadId,
      project
    );

    // Step 2: Update thread status
    const targetStatus = params.status || 'fixed';
    const statusCode = mapStatus(targetStatus);

    const finalThread = await gitApi.updateThread(
      {
        status: statusCode,
      },
      repoId,
      params.prId,
      params.threadId,
      project
    );

    // Build response
    const threadContext = finalThread.threadContext;
    const firstComment = finalThread.comments?.[0];

    return {
      success: true,
      data: {
        threadId: finalThread.id,
        status: targetStatus,
        replyAdded: true,
        totalComments: finalThread.comments?.length || 0,
        thread: {
          id: finalThread.id,
          status: targetStatus,
          context: threadContext
            ? {
                filePath: threadContext.filePath,
                lineNumber: threadContext.rightFileStart?.line,
              }
            : undefined,
          originalComment: firstComment?.content,
          latestReply: params.reply,
        },
      },
      suggestedActions: [
        'Use list_comments to see all updated threads',
        'Use get_pr to see overall PR status',
      ],
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'ADDRESS_COMMENT_FAILED',
        message: error.message || 'Failed to address comment',
      },
      suggestedActions: [
        'Verify thread exists using list_comments',
        'Try reply_to_thread and update_thread_status separately',
      ],
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const addressCommentTool = {
  name: 'address_comment',
  description:
    'Composite tool: Reply to a comment thread and update its status in one call. Common workflow for addressing PR feedback. Reduces round trips by combining reply_to_thread + update_thread_status.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID',
      },
      threadId: {
        type: 'number',
        description: 'Thread ID to reply to',
      },
      reply: {
        type: 'string',
        description: 'Reply message (supports Markdown)',
      },
      status: {
        type: 'string',
        enum: ['active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending'],
        description: 'New thread status (default: fixed)',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
    required: ['prId', 'threadId', 'reply'],
  },
};
