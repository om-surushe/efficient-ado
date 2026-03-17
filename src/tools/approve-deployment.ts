/**
 * approve_deployment tool
 * Approve or reject a pending release deployment
 */

import { z } from 'zod';
import { getReleaseApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

// ApprovalStatus: 1=pending, 2=approved, 4=rejected
const APPROVAL_STATUS = { approved: 2, rejected: 4 } as const;

export const ApproveDeploymentSchema = z.object({
  approvalId: z.number().describe('Approval ID (from get_deployment_status pendingApprovals)'),
  status: z
    .enum(['approved', 'rejected'])
    .default('approved')
    .describe('Decision: approved or rejected (default: approved)'),
  comment: z.string().optional().describe('Comment/reason for the decision'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
});

export type ApproveDeploymentInput = z.infer<typeof ApproveDeploymentSchema>;

export async function approveDeployment(input: ApproveDeploymentInput): Promise<ToolResponse> {
  try {
    const params = ApproveDeploymentSchema.parse(input);
    const project = getProject(params.project);
    const releaseApi = await getReleaseApi();

    const updatedApproval = await releaseApi.updateReleaseApproval(
      {
        id: params.approvalId,
        status: APPROVAL_STATUS[params.status] as any,
        comments: params.comment,
      } as any,
      project,
      params.approvalId
    );

    const isApproved = params.status === 'approved';

    return {
      success: true,
      data: {
        approvalId: updatedApproval.id,
        status: params.status,
        approvedBy: updatedApproval.approvedBy?.displayName,
        approvedOn: (updatedApproval as any).modifiedOn,
        releaseId: (updatedApproval as any).release?.id,
        releaseName: (updatedApproval as any).release?.name,
        environmentName: (updatedApproval as any).releaseEnvironment?.name,
        message: isApproved
          ? `✅ Deployment approved for "${(updatedApproval as any).releaseEnvironment?.name ?? 'environment'}"`
          : `❌ Deployment rejected for "${(updatedApproval as any).releaseEnvironment?.name ?? 'environment'}"`,
        suggestedActions: [
          {
            tool: 'get_deployment_status',
            params: { releaseId: (updatedApproval as any).release?.id },
            reason: 'Check updated deployment status',
            priority: 'medium' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'APPROVE_DEPLOYMENT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to process approval',
        details: {
          hint: 'Use get_deployment_status to find pending approval IDs',
          error,
        },
      },
    };
  }
}

export const approveDeploymentTool = {
  name: 'approve_deployment',
  description:
    'Approve or reject a pending release deployment. Use get_deployment_status to find pending approval IDs. Defaults to approved status. Optionally provide a comment/reason.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      approvalId: { type: 'number', description: 'Approval ID from get_deployment_status pendingApprovals' },
      status: {
        type: 'string',
        enum: ['approved', 'rejected'],
        description: 'Decision: approved or rejected (default: approved)',
      },
      comment: { type: 'string', description: 'Comment/reason for the decision' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
    },
    required: ['approvalId'],
  },
};
