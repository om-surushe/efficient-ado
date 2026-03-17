/**
 * get_build tool
 * Get detailed information about a specific build
 */

import { z } from 'zod';
import { getBuildApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const GetBuildSchema = z.object({
  buildId: z.number().describe('Build ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  includeLogs: z.boolean().optional().default(false).describe('Include list of log files (default: false)'),
  includeTimeline: z.boolean().optional().default(false).describe('Include build timeline/stages (default: false)'),
});

export type GetBuildInput = z.infer<typeof GetBuildSchema>;

const STATUS_LABEL: Record<number, string> = {
  0: 'none', 1: 'inProgress', 2: 'completed', 4: 'cancelling', 8: 'postponed', 32: 'notStarted',
};

const RESULT_LABEL: Record<number, string> = {
  0: 'none', 2: 'succeeded', 4: 'partiallySucceeded', 8: 'failed', 16: 'canceled',
};

const TASK_RESULT_LABEL: Record<number, string> = {
  0: 'succeeded', 1: 'succeededWithIssues', 2: 'failed', 3: 'canceled', 4: 'skipped', 5: 'abandoned',
};

export async function getBuild(input: GetBuildInput): Promise<ToolResponse> {
  try {
    const params = GetBuildSchema.parse(input);
    const project = getProject(params.project);
    const buildApi = await getBuildApi();

    const [build, logs, timeline] = await Promise.all([
      buildApi.getBuild(project, params.buildId),
      params.includeLogs ? buildApi.getBuildLogs(project, params.buildId).catch(() => []) : Promise.resolve(null),
      params.includeTimeline ? buildApi.getBuildTimeline(project, params.buildId).catch(() => null) : Promise.resolve(null),
    ]);

    if (!build) {
      return {
        success: false,
        error: { code: 'BUILD_NOT_FOUND', message: `Build #${params.buildId} not found` },
      };
    }

    const data: any = {
      id: build.id,
      buildNumber: build.buildNumber,
      status: STATUS_LABEL[build.status ?? 0] ?? String(build.status),
      result: build.result != null ? RESULT_LABEL[build.result] ?? String(build.result) : null,
      definition: {
        id: build.definition?.id,
        name: build.definition?.name,
        path: (build.definition as any)?.path,
      },
      sourceBranch: build.sourceBranch?.replace('refs/heads/', ''),
      sourceVersion: build.sourceVersion,
      requestedBy: build.requestedBy?.displayName,
      requestedFor: build.requestedFor?.displayName,
      startTime: build.startTime,
      finishTime: build.finishTime,
      queueTime: build.queueTime,
      url: build._links?.web?.href || '',
      parameters: build.parameters,
      tags: build.tags,
    };

    if (logs) {
      data.logs = (logs as any[]).map((l: any) => ({
        id: l.id,
        type: l.type,
        lineCount: l.lineCount,
        url: l.url,
      }));
    }

    if (timeline) {
      data.timeline = ((timeline as any).records || [])
        .filter((r: any) => r.type === 'Stage' || r.type === 'Job' || r.type === 'Phase')
        .map((r: any) => ({
          name: r.name,
          type: r.type,
          state: r.state === 2 ? 'completed' : r.state === 1 ? 'inProgress' : 'pending',
          result: r.result != null ? TASK_RESULT_LABEL[r.result] ?? String(r.result) : null,
          startTime: r.startTime,
          finishTime: r.finishTime,
        }));
    }

    data.suggestedActions = [
      {
        tool: 'get_build_logs',
        params: { buildId: params.buildId },
        reason: 'View build logs',
        priority: 'medium' as const,
      },
    ];

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_BUILD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get build',
        details: error,
      },
    };
  }
}

export const getBuildTool = {
  name: 'get_build',
  description:
    'Get detailed information about a specific build by ID. Returns status, result, definition, branch, timing, and optionally log file list and stage/job timeline. Use includeLogs=true to see available log files, then use get_build_logs to fetch content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      buildId: { type: 'number', description: 'Build ID' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      includeLogs: { type: 'boolean', description: 'Include list of log files (default: false)' },
      includeTimeline: { type: 'boolean', description: 'Include build timeline/stages (default: false)' },
    },
    required: ['buildId'],
  },
};
