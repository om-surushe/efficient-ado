/**
 * list_commits tool
 * List commits in a repository/branch
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for list_commits
 */
export const ListCommitsSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
  branch: z.string().optional().describe('Branch name (default: default branch)'),
  author: z.string().optional().describe('Filter by author email or name'),
  skip: z.number().min(0).optional().default(0).describe('Number of commits to skip (for pagination)'),
  limit: z.number().min(1).max(100).optional().default(25).describe('Maximum commits to return (1-100, default: 25)'),
});

export type ListCommitsInput = z.infer<typeof ListCommitsSchema>;

/**
 * List commits
 */
export async function listCommits(input: ListCommitsInput): Promise<ToolResponse> {
  try {
    const params = ListCommitsSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Build search criteria
    const searchCriteria: any = {
      $skip: params.skip,
      $top: params.limit,
    };

    // Get branch version
    if (params.branch) {
      searchCriteria.itemVersion = {
        version: params.branch,
        versionType: 0, // Branch
      };
    }

    // Add author filter if specified
    if (params.author) {
      searchCriteria.author = params.author;
    }

    // Get commits
    const commits = await gitApi.getCommits(repoId, searchCriteria, project);

    if (!commits || commits.length === 0) {
      return {
        success: true,
        data: {
          commits: [],
          count: 0,
          message: 'No commits found',
          filters: {
            branch: params.branch,
            author: params.author,
          },
        },
      };
    }

    // Format commits
    const formattedCommits = commits.map((commit) => ({
      commitId: commit.commitId || '',
      shortId: commit.commitId?.substring(0, 7) || '',
      author: commit.author?.name || 'Unknown',
      authorEmail: commit.author?.email || '',
      committer: commit.committer?.name || '',
      date: commit.author?.date?.toISOString() || '',
      message: commit.comment || '',
      messageShort: commit.comment?.split('\n')[0] || '',
      url: commit.url || '',
      changeCounts: commit.changeCounts
        ? {
            add: commit.changeCounts.Add || 0,
            edit: commit.changeCounts.Edit || 0,
            delete: commit.changeCounts.Delete || 0,
          }
        : undefined,
    }));

    // Group by author
    const byAuthor: Record<string, number> = {};
    formattedCommits.forEach((commit) => {
      byAuthor[commit.author] = (byAuthor[commit.author] || 0) + 1;
    });

    // Suggested actions
    const suggestedActions = [];

    if (formattedCommits.length > 0) {
      const latestCommit = formattedCommits[0];
      suggestedActions.push({
        tool: 'get_commit',
        params: { repository: repoId, commitId: latestCommit.commitId },
        reason: `View details for commit ${latestCommit.shortId}`,
        priority: 'medium' as const,
      });
    }

    if (formattedCommits.length === params.limit) {
      suggestedActions.push({
        tool: 'list_commits',
        params: { repository: repoId, branch: params.branch, skip: params.skip + params.limit },
        reason: 'Load more commits',
        priority: 'low' as const,
      });
    }

    return {
      success: true,
      data: {
        commits: formattedCommits,
        count: formattedCommits.length,
        summary: {
          byAuthor,
          totalAuthors: Object.keys(byAuthor).length,
        },
        filters: {
          branch: params.branch,
          author: params.author,
        },
        pagination: {
          skip: params.skip,
          limit: params.limit,
          hasMore: formattedCommits.length === params.limit,
        },
        suggestedActions,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_COMMITS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list commits',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const listCommitsTool = {
  name: 'list_commits',
  description:
    'List commits in a repository/branch. Returns commit IDs, authors, dates, messages, and change counts. Can filter by author and supports pagination. Use this to see recent changes or find specific commits.',
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
      branch: {
        type: 'string',
        description: 'Branch name (default: default branch)',
      },
      author: {
        type: 'string',
        description: 'Filter by author email or name',
      },
      skip: {
        type: 'number',
        description: 'Number of commits to skip (for pagination)',
        minimum: 0,
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum commits to return (1-100, default: 25)',
        minimum: 1,
        maximum: 100,
        default: 25,
      },
    },
  },
};
