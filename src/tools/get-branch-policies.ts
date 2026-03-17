/**
 * get_branch_policies tool
 * Get branch protection policies (required approvals, build validation, etc.)
 */

import { z } from 'zod';
import { getPolicyApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for get_branch_policies
 */
export const GetBranchPoliciesSchema = z.object({
  branch: z.string().optional().describe('Branch name to get policies for (e.g., "main"). Returns all project policies if omitted.'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type GetBranchPoliciesInput = z.infer<typeof GetBranchPoliciesSchema>;

/**
 * Map policy type ID to a human-readable name
 */
function mapPolicyType(typeId: string | undefined): string {
  switch (typeId) {
    case 'fa4e907d-c16b-452d-8106-7efa0cb84489':
      return 'Minimum number of reviewers';
    case '0609b952-1397-4640-95ec-e00a01b2cbcf':
      return 'Comment requirements';
    case '8e3be05e-a6ba-4d55-af96-8d9a8c80e5a4':
      return 'Merge strategy';
    case 'cb55739e-4afe-46e3-8955-2b5d6e9915e9':
      return 'Required reviewers';
    case '9461adfe-c24d-4a1a-8d3d-5fc03c9f9b1b':
      return 'Work item linking';
    case 'fd2167ab-b0be-447a-8ec8-39368250530e':
      return 'Build validation';
    default:
      return typeId || 'Unknown policy';
  }
}

/**
 * Get branch policies
 */
export async function getBranchPolicies(input: GetBranchPoliciesInput): Promise<ToolResponse> {
  try {
    const params = GetBranchPoliciesSchema.parse(input);

    const project = getProject(params.project);
    let repoId: string | undefined;

    try {
      repoId = (await import('../config.js')).getRepo(params.repository);
    } catch {
      // Repository is optional for listing all project policies
    }

    const policyApi = await getPolicyApi();

    // Get all policy configurations for the project
    const configurations = await policyApi.getPolicyConfigurations(project);

    if (!configurations || configurations.length === 0) {
      return {
        success: true,
        data: {
          project,
          branch: params.branch,
          policies: [],
          count: 0,
          message: 'No policies configured for this project',
        },
      };
    }

    // Filter by branch and/or repository if specified
    let filtered = configurations;

    if (params.branch || repoId) {
      filtered = configurations.filter((config) => {
        const scopes: any[] = config.settings?.scope || [];
        if (scopes.length === 0) return true; // Project-wide policy

        return scopes.some((scope: any) => {
          const repoMatch = !repoId || !scope.repositoryId || scope.repositoryId === repoId;
          const branchMatch =
            !params.branch ||
            !scope.refName ||
            scope.refName === `refs/heads/${params.branch}` ||
            scope.refName === `refs/heads/${params.branch.replace(/^refs\/heads\//, '')}` ||
            scope.matchKind === 'prefix'; // prefix policies apply to all branches
          return repoMatch && branchMatch;
        });
      });
    }

    const policies = filtered.map((config) => {
      const settings = config.settings || {};
      const scopes: any[] = settings.scope || [];
      const typeId = config.type?.id;
      const typeName = mapPolicyType(typeId);

      return {
        id: config.id,
        type: typeName,
        typeId,
        isEnabled: config.isEnabled ?? true,
        isBlocking: config.isBlocking ?? true,
        settings: {
          // Minimum approvers policy
          ...(settings.minimumApproverCount !== undefined && {
            minimumApproverCount: settings.minimumApproverCount,
          }),
          ...(settings.creatorVoteCounts !== undefined && {
            creatorVoteCounts: settings.creatorVoteCounts,
          }),
          ...(settings.allowDownvotes !== undefined && {
            allowDownvotes: settings.allowDownvotes,
          }),
          ...(settings.resetOnSourcePush !== undefined && {
            resetOnSourcePush: settings.resetOnSourcePush,
          }),
          // Build policy
          ...(settings.buildDefinitionId !== undefined && {
            buildDefinitionId: settings.buildDefinitionId,
          }),
          ...(settings.validDuration !== undefined && {
            validDurationHours: settings.validDuration,
          }),
          // Required reviewers
          ...(settings.requiredReviewerIds !== undefined && {
            requiredReviewers: settings.requiredReviewerIds,
          }),
          // Scope
          branches: scopes.map((s: any) => s.refName?.replace('refs/heads/', '') || 'all').filter(Boolean),
        },
      };
    });

    const blocking = policies.filter((p) => p.isBlocking && p.isEnabled);
    const nonBlocking = policies.filter((p) => !p.isBlocking && p.isEnabled);
    const disabled = policies.filter((p) => !p.isEnabled);

    return {
      success: true,
      data: {
        project,
        branch: params.branch || 'all',
        policies,
        count: policies.length,
        summary: {
          blocking: blocking.length,
          nonBlocking: nonBlocking.length,
          disabled: disabled.length,
        },
        message: `Found ${policies.length} policy configuration(s)`,
        suggestedActions: [
          {
            tool: 'check_merge_readiness',
            params: {},
            reason: 'Check if a PR meets all policies',
            priority: 'medium' as const,
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_POLICIES_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get branch policies',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getBranchPoliciesTool = {
  name: 'get_branch_policies',
  description:
    'Get branch protection policies for a project or specific branch. Returns required approver counts, build validation rules, required reviewer policies, and comment requirements. Use this to understand what a PR must satisfy before it can be merged.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      branch: {
        type: 'string',
        description: 'Branch name (e.g., "main"). Returns all project policies if omitted.',
      },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
  },
};
