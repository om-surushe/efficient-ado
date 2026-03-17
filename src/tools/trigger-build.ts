/**
 * trigger_build tool
 * Queue a new pipeline/build run
 */

import { z } from 'zod';
import { getBuildApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const TriggerBuildSchema = z.object({
  definitionId: z.number().describe('Pipeline/build definition ID to queue'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  branch: z.string().optional().describe('Branch to build (e.g., "main"). Uses definition default if not specified'),
  parameters: z
    .string()
    .optional()
    .describe('Build parameters as JSON string (e.g., \'{"myParam":"value"}\')'),
  sourceBuildId: z.number().optional().describe('Source build ID for a triggered build'),
});

export type TriggerBuildInput = z.infer<typeof TriggerBuildSchema>;

export async function triggerBuild(input: TriggerBuildInput): Promise<ToolResponse> {
  try {
    const params = TriggerBuildSchema.parse(input);
    const project = getProject(params.project);
    const buildApi = await getBuildApi();

    const buildRequest: any = {
      definition: { id: params.definitionId },
    };

    if (params.branch) {
      buildRequest.sourceBranch = params.branch.startsWith('refs/')
        ? params.branch
        : `refs/heads/${params.branch}`;
    }

    if (params.parameters) {
      buildRequest.parameters = params.parameters;
    }

    const build = await buildApi.queueBuild(
      buildRequest,
      project,
      undefined,
      undefined,
      params.sourceBuildId,
      params.definitionId
    );

    if (!build || !build.id) {
      return {
        success: false,
        error: { code: 'TRIGGER_FAILED', message: 'Failed to queue build' },
      };
    }

    return {
      success: true,
      data: {
        id: build.id,
        buildNumber: build.buildNumber,
        status: 'queued',
        definitionId: build.definition?.id,
        definitionName: build.definition?.name,
        sourceBranch: build.sourceBranch?.replace('refs/heads/', ''),
        requestedBy: build.requestedBy?.displayName,
        queueTime: build.queueTime,
        url: build._links?.web?.href || '',
        message: `✅ Build #${build.id} queued for pipeline "${build.definition?.name}"`,
        suggestedActions: [
          {
            tool: 'get_build',
            params: { buildId: build.id, includeTimeline: true },
            reason: 'Check build progress',
            priority: 'high' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'TRIGGER_BUILD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to trigger build',
        details: error,
      },
    };
  }
}

export const triggerBuildTool = {
  name: 'trigger_build',
  description:
    'Queue/trigger a new pipeline run by definition ID. Optionally specify a branch to build and parameters as a JSON string. Returns the queued build ID so you can track progress with get_build.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      definitionId: { type: 'number', description: 'Pipeline/build definition ID to queue' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      branch: { type: 'string', description: 'Branch to build (e.g., "main")' },
      parameters: { type: 'string', description: 'Build parameters as JSON string' },
      sourceBuildId: { type: 'number', description: 'Source build ID for a triggered build' },
    },
    required: ['definitionId'],
  },
};
