/**
 * list_branches tool
 * List branches in a repository
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for list_branches
 */
export const ListBranchesSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  filter: z.string().optional().describe('Filter branches by name (partial match)'),
  limit: z.number().min(1).max(100).optional().default(50).describe('Maximum results (1-100, default: 50)'),
  skip: z.number().min(0).optional().default(0).describe('Number of branches to skip (for pagination)'),
});

export type ListBranchesInput = z.infer<typeof ListBranchesSchema>;

/**
 * List branches
 */
export async function listBranches(input: ListBranchesInput): Promise<ToolResponse> {
  try {
    const params = ListBranchesSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get branches
    const refs = await gitApi.getRefs(repoId, project, 'heads'); // heads = branches

    if (!refs || refs.length === 0) {
      return {
        success: true,
        data: {
          branches: [],
          count: 0,
          message: 'No branches found',
        },
      };
    }

    // Filter branches if specified
    let filteredRefs = refs;
    if (params.filter) {
      const filterLower = params.filter.toLowerCase();
      filteredRefs = refs.filter((ref) =>
        ref.name?.toLowerCase().includes(filterLower)
      );
    }

    // Paginate results
    const totalFiltered = filteredRefs.length;
    filteredRefs = filteredRefs.slice(params.skip, params.skip + params.limit);

    // Format branches
    const formattedBranches = filteredRefs.map((ref) => ({
      name: ref.name?.replace('refs/heads/', '') || '',
      objectId: ref.objectId || '',
      creator: ref.creator?.displayName || 'Unknown',
      url: ref.url || '',
    }));

    // Get repository info for default branch
    const repo = await gitApi.getRepository(repoId, project);
    const defaultBranch = repo?.defaultBranch?.replace('refs/heads/', '') || 'main';

    // Mark default branch
    const branchesWithDefault = formattedBranches.map((branch) => ({
      ...branch,
      isDefault: branch.name === defaultBranch,
    }));

    // Suggested actions
    const suggestedActions = [];

    if (branchesWithDefault.length > 0) {
      const firstBranch = branchesWithDefault[0];
      suggestedActions.push({
        tool: 'list_commits',
        params: { repository: repoId, branch: firstBranch.name, limit: 10 },
        reason: `View recent commits on ${firstBranch.name}`,
        priority: 'medium' as const,
      });
    }

    if (!branchesWithDefault.some((b) => b.isDefault)) {
      suggestedActions.push({
        tool: 'create_branch',
        params: { repository: repoId, name: 'feature/new-feature', sourceBranch: defaultBranch },
        reason: 'Create a new branch',
        priority: 'low' as const,
      });
    }

    return {
      success: true,
      data: {
        branches: branchesWithDefault,
        count: branchesWithDefault.length,
        hasMore: params.skip + branchesWithDefault.length < totalFiltered,
        pagination: { skip: params.skip, limit: params.limit, total: totalFiltered },
        defaultBranch,
        repository: repoId,
        project,
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_BRANCHES_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list branches',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const listBranchesTool = {
  name: 'list_branches',
  description:
    'List branches in a repository. Returns branch names, commit IDs, creators, and marks the default branch. Can filter by name. Use this to see available branches before creating PRs or new branches.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
      filter: {
        type: 'string',
        description: 'Filter branches by name (partial match)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-100, default: 50)',
        minimum: 1,
        maximum: 100,
        default: 50,
      },
      skip: {
        type: 'number',
        description: 'Number of branches to skip (for pagination)',
        minimum: 0,
        default: 0,
      },
    },
  },
};
