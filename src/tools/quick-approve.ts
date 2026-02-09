/**
 * quick_approve tool (Composite)
 * Approve a PR with optional comment in one call
 */

import { z } from 'zod';
import { voteOnPR } from './vote-on-pr.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for quick_approve
 */
export const QuickApproveSchema = z.object({
  prId: z.number().describe('Pull request ID to approve'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  comment: z
    .string()
    .optional()
    .describe('Optional approval comment (e.g., "LGTM", "Looks good!")'),
  withSuggestions: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If true, votes "Approved with suggestions" (5) instead of full approval (10)'
    ),
});

export type QuickApproveInput = z.infer<typeof QuickApproveSchema>;

/**
 * Quick approve a PR - composite tool for common approval workflow
 */
export async function quickApprove(input: QuickApproveInput): Promise<ToolResponse> {
  try {
    const params = QuickApproveSchema.parse(input);

    // Determine vote value
    const vote = params.withSuggestions ? 5 : 10;

    // Use default comment if none provided
    const comment = params.comment || (params.withSuggestions ? 'Approved with minor suggestions' : 'LGTM');

    // Call vote_on_pr with the parameters
    const result = await voteOnPR({
      prId: params.prId,
      project: params.project,
      repository: params.repository,
      vote,
      comment,
    });

    if (!result.success) {
      return result;
    }

    // Enhance the response for quick approve context
    const data = result.data as any;
    
    return {
      success: true,
      data: {
        ...data,
        approvalType: params.withSuggestions ? 'Approved with suggestions' : 'Fully approved',
        message: params.withSuggestions
          ? `PR #${params.prId} approved with suggestions: "${comment}"`
          : `PR #${params.prId} approved: "${comment}"`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'QUICK_APPROVE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to approve pull request',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const quickApproveTool = {
  name: 'quick_approve',
  description:
    'Quickly approve a pull request with an optional comment. Use withSuggestions=true for "Approved with suggestions" (vote 5) or leave false for full approval (vote 10). This is a composite tool that combines voting and commenting in one call. Common comments: "LGTM", "Looks good!", "Approved".',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prId: {
        type: 'number',
        description: 'Pull request ID to approve',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      comment: {
        type: 'string',
        description: 'Optional approval comment (e.g., "LGTM", "Looks good!")',
      },
      withSuggestions: {
        type: 'boolean',
        description:
          'If true, votes "Approved with suggestions" (5) instead of full approval (10)',
        default: false,
      },
    },
    required: ['prId'],
  },
};
