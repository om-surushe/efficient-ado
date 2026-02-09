/**
 * create_branch tool
 * Create a new branch
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for create_branch
 */
export const CreateBranchSchema = z.object({
  name: z.string().describe('Branch name (e.g., "feature/new-feature")'),
  sourceBranch: z.string().optional().describe('Source branch to branch from (default: default branch)'),
  sourceCommit: z.string().optional().describe('Source commit ID (if not using sourceBranch)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;

/**
 * Create branch
 */
export async function createBranch(input: CreateBranchInput): Promise<ToolResponse> {
  try {
    const params = CreateBranchSchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);

    const gitApi = await getGitApi();

    // Get source commit
    let sourceCommitId = params.sourceCommit;

    if (!sourceCommitId && params.sourceBranch) {
      // Get commit from source branch
      const sourceBranchRef = `refs/heads/${params.sourceBranch}`;
      const refs = await gitApi.getRefs(repoId, project, `heads/${params.sourceBranch}`);

      if (!refs || refs.length === 0) {
        return {
          success: false,
          error: {
            code: 'SOURCE_BRANCH_NOT_FOUND',
            message: `Source branch "${params.sourceBranch}" not found`,
          },
        };
      }

      sourceCommitId = refs[0].objectId;
    }

    if (!sourceCommitId) {
      // Get default branch commit
      const repo = await gitApi.getRepository(repoId, project);
      const defaultBranchName = repo?.defaultBranch?.replace('refs/heads/', '') || 'main';
      const refs = await gitApi.getRefs(repoId, project, `heads/${defaultBranchName}`);

      if (!refs || refs.length === 0) {
        return {
          success: false,
          error: {
            code: 'DEFAULT_BRANCH_NOT_FOUND',
            message: 'Could not determine source commit',
          },
        };
      }

      sourceCommitId = refs[0].objectId;
    }

    if (!sourceCommitId) {
      return {
        success: false,
        error: {
          code: 'NO_SOURCE_COMMIT',
          message: 'Could not determine source commit for new branch',
        },
      };
    }

    // Create branch reference
    const refUpdate = {
      name: `refs/heads/${params.name}`,
      oldObjectId: '0000000000000000000000000000000000000000', // All zeros for new ref
      newObjectId: sourceCommitId,
    };

    const result = await gitApi.updateRefs([refUpdate], repoId, project);

    if (!result || result.length === 0 || !result[0].success) {
      return {
        success: false,
        error: {
          code: 'CREATE_BRANCH_FAILED',
          message: result?.[0]?.customMessage || 'Failed to create branch',
        },
      };
    }

    return {
      success: true,
      data: {
        name: params.name,
        commitId: sourceCommitId,
        sourceBranch: params.sourceBranch || 'default branch',
        message: `✅ Branch "${params.name}" created`,
        suggestedActions: [
          {
            tool: 'list_branches',
            params: { repository: repoId },
            reason: 'View all branches',
            priority: 'low' as const,
          },
          {
            tool: 'create_pr',
            params: { sourceBranch: params.name, title: 'New PR from ' + params.name },
            reason: 'Create PR from new branch',
            priority: 'medium' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'CREATE_BRANCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create branch',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const createBranchTool = {
  name: 'create_branch',
  description:
    'Create a new branch. Specify branch name and optionally sourceBranch (branch to branch from) or sourceCommit (specific commit ID). If neither is specified, branches from default branch. Use this before starting new work or creating PRs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Branch name (e.g., "feature/new-feature")',
      },
      sourceBranch: {
        type: 'string',
        description: 'Source branch to branch from (default: default branch)',
      },
      sourceCommit: {
        type: 'string',
        description: 'Source commit ID (if not using sourceBranch)',
      },
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
    required: ['name'],
  },
};
