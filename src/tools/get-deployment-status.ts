/**
 * get_deployment_status tool
 * Get detailed deployment status for a release
 */

import { z } from 'zod';
import { getReleaseApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

const ENV_STATUS_LABEL: Record<number, string> = {
  0: 'undefined',
  1: 'notStarted',
  2: 'inProgress',
  4: 'succeeded',
  8: 'canceled',
  16: 'rejected',
  32: 'queued',
  64: 'scheduled',
  128: 'partiallySucceeded',
};

const APPROVAL_STATUS_LABEL: Record<number, string> = {
  0: 'undefined',
  1: 'pending',
  2: 'approved',
  4: 'rejected',
  8: 'reassigned',
  16: 'canceled',
  32: 'skipped',
};

export const GetDeploymentStatusSchema = z.object({
  releaseId: z.number().describe('Release ID (from list_releases)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
});

export type GetDeploymentStatusInput = z.infer<typeof GetDeploymentStatusSchema>;

export async function getDeploymentStatus(input: GetDeploymentStatusInput): Promise<ToolResponse> {
  try {
    const params = GetDeploymentStatusSchema.parse(input);
    const project = getProject(params.project);
    const releaseApi = await getReleaseApi();

    const release = await releaseApi.getRelease(project, params.releaseId);

    if (!release) {
      return {
        success: false,
        error: { code: 'RELEASE_NOT_FOUND', message: `Release #${params.releaseId} not found` },
      };
    }

    const environments = (release.environments || []).map((env: any) => {
      const pendingApprovals = (env.preDeployApprovals || [])
        .concat(env.postDeployApprovals || [])
        .filter((a: any) => a.status === 1); // 1 = pending

      return {
        id: env.id,
        name: env.name,
        status: ENV_STATUS_LABEL[env.status] ?? String(env.status),
        rank: env.rank,
        deploySteps: (env.deploySteps || []).map((step: any) => ({
          id: step.id,
          attemptNumber: step.attempt,
          status: ENV_STATUS_LABEL[step.status] ?? String(step.status),
          operationStatus: step.operationStatus,
          requestedBy: step.requestedBy?.displayName,
          lastModifiedOn: step.lastModifiedOn,
        })),
        pendingApprovals: pendingApprovals.map((a: any) => ({
          id: a.id,
          approver: a.approver?.displayName,
          status: APPROVAL_STATUS_LABEL[a.status] ?? String(a.status),
          isAutomated: a.isAutomated,
        })),
      };
    });

    const hasPendingApprovals = environments.some((env: any) => env.pendingApprovals.length > 0);
    const allApprovalIds = environments.flatMap((env: any) => env.pendingApprovals.map((a: any) => a.id));

    const data: any = {
      id: release.id,
      name: release.name,
      status: release.status,
      definitionId: release.releaseDefinition?.id,
      definitionName: release.releaseDefinition?.name,
      createdOn: release.createdOn,
      createdBy: release.createdBy?.displayName,
      environments,
      artifacts: (release.artifacts || []).map((a: any) => ({
        alias: a.alias,
        type: a.type,
        version: a.definitionReference?.version?.id || a.definitionReference?.branch?.id,
        definitionName: a.definitionReference?.definition?.name,
      })),
    };

    if (hasPendingApprovals) {
      data.suggestedActions = [
        {
          tool: 'approve_deployment',
          params: { approvalId: allApprovalIds[0], comment: 'Approved' },
          reason: `${allApprovalIds.length} pending approval(s) require action`,
          priority: 'high' as const,
        },
      ];
    } else {
      data.suggestedActions = [];
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_DEPLOYMENT_STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get deployment status',
        details: error,
      },
    };
  }
}

export const getDeploymentStatusTool = {
  name: 'get_deployment_status',
  description:
    'Get detailed deployment status for a release. Shows each environment (stage) with its deployment steps, status, and any pending approvals. If approvals are pending, suggests approve_deployment action.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      releaseId: { type: 'number', description: 'Release ID (from list_releases)' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
    },
    required: ['releaseId'],
  },
};
