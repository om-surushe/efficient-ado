/**
 * delete_branch tool
 * Delete a branch from a repository
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

const ZERO_OID = '0000000000000000000000000000000000000000';

/**
 * Input schema for delete_branch
 */
export const DeleteBranchSchema = z.object({
  branch: z.string().describe('Branch name to delete (e.g., "feature/my-branch")'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type DeleteBranchInput = z.infer<typeof DeleteBranchSchema>;

/**
 * Delete a branch
 */
export async function deleteBranch(input: DeleteBranchInput): Promise<ToolResponse> {
  try {
    const params = DeleteBranchSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);
    const gitApi = await getGitApi();

    const branchRef = `refs/heads/${params.branch.replace(/^refs\/heads\//, '')}`;

    // Check default branch
    const repo = await gitApi.getRepository(repoId, project);
    const defaultBranch = repo.defaultBranch || 'refs/heads/main';

    if (branchRef === defaultBranch) {
      return {
        success: false,
        error: {
          code: 'CANNOT_DELETE_DEFAULT',
          message: `Cannot delete the default branch (${params.branch})`,
          details: { defaultBranch: defaultBranch.replace('refs/heads/', '') },
        },
      };
    }

    // Get current ref SHA
    const refs = await gitApi.getRefs(repoId, project, branchRef.replace('refs/', ''));
    const ref = refs.find((r) => r.name === branchRef);

    if (!ref || !ref.objectId) {
      return {
        success: false,
        error: {
          code: 'BRANCH_NOT_FOUND',
          message: `Branch '${params.branch}' not found`,
        },
      };
    }

    // Check for open PRs targeting this branch
    const openPRs = await gitApi
      .getPullRequests(repoId, { sourceRefName: branchRef, status: 1 }, project, undefined, 0, 5)
      .catch(() => []);

    // Delete the branch by updating ref to zero OID
    await gitApi.updateRefs(
      [{ name: branchRef, oldObjectId: ref.objectId, newObjectId: ZERO_OID }],
      repoId,
      project
    );

    const response: any = {
      branch: params.branch,
      commitId: ref.objectId,
      message: `Branch '${params.branch}' deleted`,
      suggestedActions: [
        {
          tool: 'list_branches',
          params: {},
          reason: 'View remaining branches',
          priority: 'low' as const,
        },
      ],
    };

    if (openPRs.length > 0) {
      response.warning = `${openPRs.length} open PR(s) were sourced from this branch — they will be abandoned`;
      response.affectedPRs = openPRs.map((pr) => ({
        id: pr.pullRequestId,
        title: pr.title,
      }));
    }

    return { success: true, data: response };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DELETE_BRANCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete branch',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const deleteBranchTool = {
  name: 'delete_branch',
  description:
    'Delete a branch from a repository. Refuses to delete the default branch. Warns if there are open PRs sourced from the branch. The branch SHA is returned for recovery if needed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      branch: {
        type: 'string',
        description: 'Branch name to delete (e.g., "feature/my-branch")',
      },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
    required: ['branch'],
  },
};
