/**
 * list_releases tool
 * List release pipeline executions
 */

import { z } from 'zod';
import { getReleaseApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

const RELEASE_STATUS_LABEL: Record<number, string> = {
  0: 'undefined',
  1: 'draft',
  2: 'active',
  4: 'abandoned',
};

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

export const ListReleasesSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  definitionId: z.number().optional().describe('Filter by release definition/pipeline ID'),
  status: z
    .enum(['active', 'abandoned', 'draft'])
    .optional()
    .describe('Filter by release status'),
  top: z.number().optional().default(10).describe('Maximum releases to return (default: 10)'),
  searchText: z.string().optional().describe('Search releases by name'),
});

export type ListReleasesInput = z.infer<typeof ListReleasesSchema>;

const STATUS_MAP: Record<string, number> = {
  draft: 1,
  active: 2,
  abandoned: 4,
};

export async function listReleases(input: ListReleasesInput): Promise<ToolResponse> {
  try {
    const params = ListReleasesSchema.parse(input);
    const project = getProject(params.project);
    const releaseApi = await getReleaseApi();

    const statusFilter = params.status ? STATUS_MAP[params.status] : undefined;

    const releases = await releaseApi.getReleases(
      project,
      params.definitionId,
      undefined, // definitionEnvironmentId
      params.searchText,
      undefined, // createdBy
      statusFilter as any,
      undefined, // environmentStatusFilter
      undefined, // minCreatedTime
      undefined, // maxCreatedTime
      undefined, // queryOrder
      params.top
    );

    const items = releases || [];
    const formatted = (Array.isArray(items) ? items : (items as any).value || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      status: RELEASE_STATUS_LABEL[r.status] ?? String(r.status),
      definitionId: r.releaseDefinition?.id,
      definitionName: r.releaseDefinition?.name,
      createdOn: r.createdOn,
      createdBy: r.createdBy?.displayName,
      environments: (r.environments || []).map((env: any) => ({
        id: env.id,
        name: env.name,
        status: ENV_STATUS_LABEL[env.status] ?? String(env.status),
      })),
    }));

    return {
      success: true,
      data: {
        releases: formatted,
        count: formatted.length,
        suggestedActions:
          formatted.length > 0
            ? [
                {
                  tool: 'get_deployment_status',
                  params: { releaseId: formatted[0].id },
                  reason: 'Get detailed deployment status for latest release',
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
        code: 'LIST_RELEASES_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list releases',
        details: error,
      },
    };
  }
}

export const listReleasesTool = {
  name: 'list_releases',
  description:
    'List release pipeline executions. Filter by definition ID, status (active/abandoned/draft), or search text. Returns release name, status, environments with deployment status, and who created it.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      definitionId: { type: 'number', description: 'Filter by release definition/pipeline ID' },
      status: {
        type: 'string',
        enum: ['active', 'abandoned', 'draft'],
        description: 'Filter by release status',
      },
      top: { type: 'number', description: 'Maximum releases to return (default: 10)' },
      searchText: { type: 'string', description: 'Search releases by name' },
    },
  },
};
