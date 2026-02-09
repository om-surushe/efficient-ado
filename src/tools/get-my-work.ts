/**
 * get_my_work tool (composite)
 * Get all work relevant to current user: PRs created, PRs needing review, assigned work items
 */

import { z } from 'zod';
import { getGitApi, getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';
import { GitPullRequestSearchCriteria } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

/**
 * Input schema for get_my_work
 */
export const GetMyWorkSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  includeCompleted: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include completed/merged PRs (default: false)'),
  maxPRs: z.number().optional().default(10).describe('Maximum PRs to fetch per category (default: 10)'),
  maxWorkItems: z.number().optional().default(10).describe('Maximum work items to fetch (default: 10)'),
});

export type GetMyWorkInput = z.infer<typeof GetMyWorkSchema>;

/**
 * Get my work (composite)
 */
export async function getMyWork(input: GetMyWorkInput): Promise<ToolResponse> {
  try {
    const params = GetMyWorkSchema.parse(input);

    const project = getProject(params.project);
    const gitApi = await getGitApi();
    const witApi = await getWorkItemApi();

    // Get current user
    const { getClient } = await import('../client.js');
    const connection = getClient();
    const connectionData = await connection.connect();
    const currentUser = connectionData.authenticatedUser;

    if (!currentUser || !currentUser.id) {
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Could not determine current user',
        },
      };
    }

    const userId = currentUser.id;

    // Prepare search criteria
    const activePRCriteria: GitPullRequestSearchCriteria = {
      creatorId: userId,
      status: params.includeCompleted ? undefined : 1, // 1 = Active
    };

    const reviewPRCriteria: GitPullRequestSearchCriteria = {
      reviewerId: userId,
      status: params.includeCompleted ? undefined : 1,
    };

    // Fetch data in parallel
    const [myPRs, prsToReview, workItems] = await Promise.all([
      // My created PRs
      gitApi
        .getPullRequests(project, activePRCriteria, params.maxPRs)
        .catch(() => []),

      // PRs I need to review
      gitApi
        .getPullRequests(project, reviewPRCriteria, params.maxPRs)
        .catch(() => []),

      // My work items
      witApi
        .queryByWiql(
          {
            query: `
              SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
              FROM WorkItems
              WHERE [System.AssignedTo] = @me
              AND [System.TeamProject] = @project
              ORDER BY [System.ChangedDate] DESC
            `,
          },
          {
            project,
            team: undefined,
          },
          undefined,
          params.maxWorkItems
        )
        .catch(() => ({ workItems: [] })),
    ]);

    // Filter out PRs where user is both creator and reviewer (avoid duplicates)
    const uniquePRsToReview = prsToReview.filter(
      (pr) => pr.createdBy?.id !== userId
    );

    // Format PRs
    const formatPR = (pr: any) => ({
      id: pr.pullRequestId,
      title: pr.title,
      status: pr.status === 1 ? 'active' : pr.status === 2 ? 'abandoned' : 'completed',
      isDraft: pr.isDraft,
      repository: pr.repository?.name,
      sourceBranch: pr.sourceRefName?.replace('refs/heads/', ''),
      targetBranch: pr.targetRefName?.replace('refs/heads/', ''),
      createdBy: pr.createdBy?.displayName,
      createdDate: pr.creationDate,
      url: `https://dev.azure.com/${pr.repository?.project?.name}/_git/${pr.repository?.name}/pullrequest/${pr.pullRequestId}`,
      myVote: pr.reviewers?.find((r: any) => r.id === userId)?.vote || 0,
    });

    // Fetch full work item details
    const workItemIds = workItems.workItems?.map((wi: any) => wi.id) || [];
    let workItemDetails = [];

    if (workItemIds.length > 0) {
      const fullWorkItems = await witApi.getWorkItems(
        workItemIds,
        project,
        undefined,
        undefined,
        0 // No expansion
      );

      workItemDetails = fullWorkItems.map((wi: any) => {
        const fields = wi.fields || {};
        return {
          id: wi.id,
          type: fields['System.WorkItemType'] || 'Unknown',
          title: fields['System.Title'] || 'Untitled',
          state: fields['System.State'] || 'Unknown',
          priority: fields['Microsoft.VSTS.Common.Priority'],
          tags: fields['System.Tags'] || '',
          url: wi._links?.html?.href || '',
        };
      });
    }

    // Build summary stats
    const summary = {
      myPRs: {
        total: myPRs.length,
        active: myPRs.filter((pr) => pr.status === 1).length,
        draft: myPRs.filter((pr) => pr.isDraft).length,
      },
      prsToReview: {
        total: uniquePRsToReview.length,
        needsVote: uniquePRsToReview.filter(
          (pr) => {
            const myReview = pr.reviewers?.find((r: any) => r.id === userId);
            return !myReview || myReview.vote === 0;
          }
        ).length,
      },
      workItems: {
        total: workItemDetails.length,
        byType: workItemDetails.reduce((acc: any, wi: any) => {
          acc[wi.type] = (acc[wi.type] || 0) + 1;
          return acc;
        }, {}),
      },
    };

    return {
      success: true,
      data: {
        summary,
        myPRs: myPRs.map(formatPR),
        prsToReview: uniquePRsToReview.map(formatPR),
        workItems: workItemDetails,
        user: {
          id: currentUser.id,
          name: currentUser.providerDisplayName || currentUser.displayName,
        },
      },
      suggestedActions: [
        summary.prsToReview.needsVote > 0
          ? `${summary.prsToReview.needsVote} PRs need your review - use start_review`
          : undefined,
        summary.myPRs.active > 0
          ? 'Use get_pr to check status of your PRs'
          : undefined,
        summary.workItems.total > 0
          ? 'Use get_work_item to see work item details'
          : undefined,
      ].filter(Boolean) as string[],
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'GET_MY_WORK_FAILED',
        message: error.message || 'Failed to get my work',
      },
      suggestedActions: [
        'Try list_prs with creatorId filter',
        'Try list_my_work_items for work items',
      ],
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const getMyWorkTool = {
  name: 'get_my_work',
  description:
    'Composite tool: Get all work relevant to you in one call. Fetches PRs you created, PRs needing your review, and work items assigned to you. Perfect for daily standup or getting oriented. Reduces round trips by combining multiple queries.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: {
        type: 'string',
        description: 'Project name (uses default if not specified)',
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed/merged PRs (default: false)',
      },
      maxPRs: {
        type: 'number',
        description: 'Maximum PRs to fetch per category (default: 10)',
      },
      maxWorkItems: {
        type: 'number',
        description: 'Maximum work items to fetch (default: 10)',
      },
    },
  },
};
