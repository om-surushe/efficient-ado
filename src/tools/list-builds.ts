/**
 * list_builds tool
 * List builds/pipeline runs for a project
 */

import { z } from 'zod';
import { getBuildApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';
import { BuildStatus, BuildResult } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';

const STATUS_MAP: Record<string, BuildStatus> = {
  inProgress: BuildStatus.InProgress,
  completed: BuildStatus.Completed,
  notStarted: BuildStatus.NotStarted,
  cancelling: BuildStatus.Cancelling,
  all: BuildStatus.All,
};

const RESULT_MAP: Record<string, BuildResult> = {
  succeeded: BuildResult.Succeeded,
  partiallySucceeded: BuildResult.PartiallySucceeded,
  failed: BuildResult.Failed,
  canceled: BuildResult.Canceled,
};

const STATUS_LABEL: Record<number, string> = {
  [BuildStatus.None]: 'none',
  [BuildStatus.InProgress]: 'inProgress',
  [BuildStatus.Completed]: 'completed',
  [BuildStatus.Cancelling]: 'cancelling',
  [BuildStatus.Postponed]: 'postponed',
  [BuildStatus.NotStarted]: 'notStarted',
  [BuildStatus.All]: 'all',
};

const RESULT_LABEL: Record<number, string> = {
  [BuildResult.None]: 'none',
  [BuildResult.Succeeded]: 'succeeded',
  [BuildResult.PartiallySucceeded]: 'partiallySucceeded',
  [BuildResult.Failed]: 'failed',
  [BuildResult.Canceled]: 'canceled',
};

export const ListBuildsSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  definitionId: z.number().optional().describe('Filter by pipeline/definition ID'),
  branch: z.string().optional().describe('Filter by branch name (e.g., "main")'),
  status: z
    .enum(['inProgress', 'completed', 'notStarted', 'cancelling', 'all'])
    .optional()
    .default('all')
    .describe('Filter by build status (default: all)'),
  result: z
    .enum(['succeeded', 'partiallySucceeded', 'failed', 'canceled'])
    .optional()
    .describe('Filter by build result (only applies to completed builds)'),
  requestedFor: z.string().optional().describe('Filter by who triggered the build (display name or email)'),
  top: z.number().optional().default(10).describe('Maximum builds to return (default: 10)'),
});

export type ListBuildsInput = z.infer<typeof ListBuildsSchema>;

export async function listBuilds(input: ListBuildsInput): Promise<ToolResponse> {
  try {
    const params = ListBuildsSchema.parse(input);
    const project = getProject(params.project);
    const buildApi = await getBuildApi();

    const statusFilter = params.status ? STATUS_MAP[params.status] : undefined;
    const resultFilter = params.result ? RESULT_MAP[params.result] : undefined;
    const branchRef = params.branch
      ? params.branch.startsWith('refs/')
        ? params.branch
        : `refs/heads/${params.branch}`
      : undefined;

    const builds = await buildApi.getBuilds(
      project,
      params.definitionId ? [params.definitionId] : undefined,
      undefined, // queues
      undefined, // buildNumber
      undefined, // minTime
      undefined, // maxTime
      params.requestedFor,
      undefined, // reasonFilter
      statusFilter,
      resultFilter,
      undefined, // tagFilters
      undefined, // properties
      params.top,
      undefined, // continuationToken
      undefined, // maxBuildsPerDefinition
      undefined, // deletedFilter
      undefined, // queryOrder
      branchRef
    );

    const formatted = (builds || []).map((b: any) => ({
      id: b.id,
      buildNumber: b.buildNumber,
      status: STATUS_LABEL[b.status] ?? String(b.status),
      result: b.result != null ? RESULT_LABEL[b.result] ?? String(b.result) : null,
      definitionId: b.definition?.id,
      definitionName: b.definition?.name,
      sourceBranch: b.sourceBranch?.replace('refs/heads/', ''),
      sourceVersion: b.sourceVersion?.substring(0, 8),
      requestedBy: b.requestedBy?.displayName,
      startTime: b.startTime,
      finishTime: b.finishTime,
      url: b._links?.web?.href || '',
    }));

    return {
      success: true,
      data: {
        builds: formatted,
        count: formatted.length,
        suggestedActions: formatted.length > 0
          ? [
              {
                tool: 'get_build',
                params: { buildId: formatted[0].id },
                reason: 'Get detailed info for the latest build',
                priority: 'medium' as const,
              },
            ]
          : [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_BUILDS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list builds',
        details: error,
      },
    };
  }
}

export const listBuildsTool = {
  name: 'list_builds',
  description:
    'List CI/CD pipeline builds for a project. Filter by pipeline definition ID, branch, status (inProgress/completed/notStarted), or result (succeeded/failed/canceled). Returns build number, status, result, branch, and who triggered it.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      definitionId: { type: 'number', description: 'Filter by pipeline/definition ID' },
      branch: { type: 'string', description: 'Filter by branch name (e.g., "main")' },
      status: {
        type: 'string',
        enum: ['inProgress', 'completed', 'notStarted', 'cancelling', 'all'],
        description: 'Filter by build status (default: all)',
      },
      result: {
        type: 'string',
        enum: ['succeeded', 'partiallySucceeded', 'failed', 'canceled'],
        description: 'Filter by build result',
      },
      requestedFor: { type: 'string', description: 'Filter by who triggered the build' },
      top: { type: 'number', description: 'Maximum builds to return (default: 10)' },
    },
  },
};
