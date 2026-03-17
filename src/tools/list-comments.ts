/**
 * list_comments tool
 * Get all comment threads from a pull request
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse, ThreadStatus } from '../types.js';

/**
 * Input schema for list_comments
 */
export const ListCommentsSchema = z.object({
  prId: z.number().describe('Pull request ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  status: z
    .enum(['active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending', 'all'])
    .optional()
    .describe('Filter by thread status (default: all)'),
  includeSystemComments: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include system-generated comments (default: false)'),
  limit: z.number().min(1).max(200).optional().default(100).describe('Maximum threads to return (1-200, default: 100)'),
  skip: z.number().min(0).optional().default(0).describe('Number of threads to skip (for pagination)'),
});

export type ListCommentsInput = z.infer<typeof ListCommentsSchema>;

/**
 * Map ADO status to our type
 */
function mapThreadStatus(status: number | undefined): ThreadStatus {
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
 * List comments from PR
 */
export async function listComments(input: ListCommentsInput): Promise<ToolResponse> {
  try {
    const params = ListCommentsSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get all threads
    const threads = await gitApi.getThreads(repoId, params.prId, project);

    if (!threads || threads.length === 0) {
      return {
        success: true,
        data: {
          threads: [],
          count: 0,
          message: 'No comment threads found',
          summary: {
            total: 0,
            byStatus: {
              active: 0,
              fixed: 0,
              wontFix: 0,
              closed: 0,
              byDesign: 0,
              pending: 0,
            },
            byType: {
              general: 0,
              inline: 0,
            },
          },
        },
      };
    }

    // Filter and format threads
    let filteredThreads = threads;

    // Filter by status if specified
    if (params.status && params.status !== 'all') {
      const statusMap: Record<string, number> = {
        active: 1,
        fixed: 2,
        wontFix: 3,
        closed: 4,
        byDesign: 5,
        pending: 6,
      };
      const targetStatus = statusMap[params.status];
      filteredThreads = threads.filter((t) => t.status === targetStatus);
    }

    // Format threads
    const formattedThreads = filteredThreads.map((thread) => {
      const isInline = !!thread.threadContext?.filePath;
      const comments = thread.comments || [];

      // Filter out system comments if requested
      const filteredComments = params.includeSystemComments
        ? comments
        : comments.filter((c) => c.commentType === 1); // 1 = Text

      return {
        id: thread.id!,
        status: mapThreadStatus(thread.status),
        type: isInline ? ('inline' as const) : ('general' as const),
        comments: filteredComments.map((c) => ({
          id: c.id!,
          content: c.content || '',
          author: c.author?.displayName || 'Unknown',
          publishedDate: c.publishedDate?.toISOString() || '',
          isSystem: c.commentType !== 1,
        })),
        location: isInline
          ? {
              filePath: thread.threadContext!.filePath!,
              line: thread.threadContext?.rightFileStart?.line || thread.threadContext?.leftFileStart?.line || 0,
              side:
                thread.threadContext?.rightFileStart?.line
                  ? 'right (modified)'
                  : 'left (original)',
            }
          : null,
        canResolve: thread.status === 1, // Active threads can be resolved
      };
    });

    // Paginate
    const totalThreads = formattedThreads.length;
    const paginatedThreads = formattedThreads.slice(params.skip, params.skip + params.limit);

    // Calculate summary (across all filtered threads, not just page)
    const summary = {
      total: formattedThreads.length,
      byStatus: {
        active: formattedThreads.filter((t) => t.status === 'active').length,
        fixed: formattedThreads.filter((t) => t.status === 'fixed').length,
        wontFix: formattedThreads.filter((t) => t.status === 'wontFix').length,
        closed: formattedThreads.filter((t) => t.status === 'closed').length,
        byDesign: formattedThreads.filter((t) => t.status === 'byDesign').length,
        pending: formattedThreads.filter((t) => t.status === 'pending').length,
      },
      byType: {
        general: formattedThreads.filter((t) => t.type === 'general').length,
        inline: formattedThreads.filter((t) => t.type === 'inline').length,
      },
    };

    // Suggested actions
    const suggestedActions = [];

    const activeThreads = paginatedThreads.filter((t) => t.status === 'active');
    if (activeThreads.length > 0) {
      suggestedActions.push({
        tool: 'reply_to_thread',
        params: { prId: params.prId, threadId: activeThreads[0].id },
        reason: `Reply to active thread #${activeThreads[0].id}`,
        priority: 'high' as const,
      });
      suggestedActions.push({
        tool: 'update_thread_status',
        params: { prId: params.prId, threadId: activeThreads[0].id, status: 'fixed' },
        reason: 'Mark thread as resolved if issue is fixed',
        priority: 'medium' as const,
      });
    }

    return {
      success: true,
      data: {
        threads: paginatedThreads,
        count: paginatedThreads.length,
        hasMore: params.skip + paginatedThreads.length < totalThreads,
        pagination: { skip: params.skip, limit: params.limit, total: totalThreads },
        summary,
        filters: {
          status: params.status || 'all',
          includeSystemComments: params.includeSystemComments,
        },
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_COMMENTS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list comments',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const listCommentsTool = {
  name: 'list_comments',
  description:
    'List all comment threads from a pull request. Can filter by status (active/fixed/wontFix/closed/etc). Returns both general and inline comments with their locations, authors, and current status. Use this to see all discussions on a PR.',
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
      status: {
        type: 'string',
        enum: ['active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending', 'all'],
        description: 'Filter by thread status (default: all)',
      },
      includeSystemComments: {
        type: 'boolean',
        description: 'Include system-generated comments (default: false)',
        default: false,
      },
      limit: {
        type: 'number',
        description: 'Maximum threads to return (1-200, default: 100)',
        minimum: 1,
        maximum: 200,
        default: 100,
      },
      skip: {
        type: 'number',
        description: 'Number of threads to skip (for pagination)',
        minimum: 0,
        default: 0,
      },
    },
    required: ['prId'],
  },
};
