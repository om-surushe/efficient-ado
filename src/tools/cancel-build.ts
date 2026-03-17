/**
 * cancel_build tool
 * Cancel a running or queued build
 */

import { z } from 'zod';
import { getBuildApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';
import { BuildStatus } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';

export const CancelBuildSchema = z.object({
  buildId: z.number().describe('Build ID to cancel'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
});

export type CancelBuildInput = z.infer<typeof CancelBuildSchema>;

export async function cancelBuild(input: CancelBuildInput): Promise<ToolResponse> {
  try {
    const params = CancelBuildSchema.parse(input);
    const project = getProject(params.project);
    const buildApi = await getBuildApi();

    // Verify build exists and is cancellable
    const build = await buildApi.getBuild(project, params.buildId);

    if (!build) {
      return {
        success: false,
        error: { code: 'BUILD_NOT_FOUND', message: `Build #${params.buildId} not found` },
      };
    }

    if (build.status === BuildStatus.Completed) {
      return {
        success: false,
        error: {
          code: 'BUILD_ALREADY_COMPLETED',
          message: `Build #${params.buildId} has already completed and cannot be cancelled`,
        },
      };
    }

    const updated = await buildApi.updateBuild(
      { status: BuildStatus.Cancelling } as any,
      project,
      params.buildId
    );

    return {
      success: true,
      data: {
        id: updated.id,
        buildNumber: updated.buildNumber,
        status: 'cancelling',
        message: `✅ Build #${params.buildId} (${build.buildNumber}) is being cancelled`,
        suggestedActions: [
          {
            tool: 'get_build',
            params: { buildId: params.buildId },
            reason: 'Confirm build is cancelled',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'CANCEL_BUILD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to cancel build',
        details: error,
      },
    };
  }
}

export const cancelBuildTool = {
  name: 'cancel_build',
  description:
    'Cancel a running or queued build. Verifies the build exists and is not already completed before attempting cancellation. Returns the updated build status.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      buildId: { type: 'number', description: 'Build ID to cancel' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
    },
    required: ['buildId'],
  },
};
