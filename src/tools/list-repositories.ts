/**
 * list_repositories tool
 * List repositories in a project
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for list_repositories
 */
export const ListRepositoriesSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
});

export type ListRepositoriesInput = z.infer<typeof ListRepositoriesSchema>;

/**
 * List repositories
 */
export async function listRepositories(input: ListRepositoriesInput): Promise<ToolResponse> {
  try {
    const params = ListRepositoriesSchema.parse(input);

    const project = getProject(params.project);
    const gitApi = await getGitApi();

    // Get repositories
    const repos = await gitApi.getRepositories(project);

    if (!repos || repos.length === 0) {
      return {
        success: true,
        data: {
          repositories: [],
          count: 0,
          message: 'No repositories found',
        },
      };
    }

    // Format repositories
    const formattedRepos = repos.map((repo) => ({
      id: repo.id!,
      name: repo.name || 'Unnamed',
      defaultBranch: repo.defaultBranch?.replace('refs/heads/', '') || 'main',
      url: repo.webUrl || '',
      remoteUrl: repo.remoteUrl || '',
      size: repo.size || 0,
      isDisabled: repo.isDisabled || false,
    }));

    // Suggested actions
    const suggestedActions = [];

    if (formattedRepos.length > 0) {
      const firstRepo = formattedRepos[0];
      suggestedActions.push({
        tool: 'list_branches',
        params: { repository: firstRepo.name },
        reason: `List branches in ${firstRepo.name}`,
        priority: 'medium' as const,
      });
      suggestedActions.push({
        tool: 'list_prs',
        params: { repository: firstRepo.name },
        reason: `List PRs in ${firstRepo.name}`,
        priority: 'low' as const,
      });
    }

    return {
      success: true,
      data: {
        repositories: formattedRepos,
        count: formattedRepos.length,
        project,
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_REPOS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list repositories',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const listRepositoriesTool = {
  name: 'list_repositories',
  description:
    'List all repositories in a project. Returns repository names, default branches, URLs, and sizes. Use this to discover available repositories before listing branches or PRs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
    },
  },
};
