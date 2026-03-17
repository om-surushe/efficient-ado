#!/usr/bin/env node

/**
 * Efficient ADO MCP Server
 * LLM-optimized Azure DevOps workflows for AI assistants
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { setupWorkspace, setupWorkspaceTool } from './tools/setup-workspace.js';
import { listPRs, listPRsTool } from './tools/list-prs.js';
import { getPR, getPRTool } from './tools/get-pr.js';
import { startReview, startReviewTool } from './tools/start-review.js';
import { voteOnPR, voteOnPRTool } from './tools/vote-on-pr.js';
import { manageReviewers, manageReviewersTool } from './tools/manage-reviewers.js';
import { quickApprove, quickApproveTool } from './tools/quick-approve.js';
import { checkMergeReadiness, checkMergeReadinessTool } from './tools/check-merge-readiness.js';
import { completePR, completePRTool } from './tools/complete-pr.js';
import { listComments, listCommentsTool } from './tools/list-comments.js';
import { addComment, addCommentTool } from './tools/add-comment.js';
import { replyToThread, replyToThreadTool } from './tools/reply-to-thread.js';
import { updateThreadStatus, updateThreadStatusTool } from './tools/update-thread-status.js';
import { getPRChanges, getPRChangesTool } from './tools/get-pr-changes.js';
import { getFileDiff, getFileDiffTool } from './tools/get-file-diff.js';
import { getFileContent, getFileContentTool } from './tools/get-file-content.js';
import { getWorkItem, getWorkItemTool } from './tools/get-work-item.js';
import { listMyWorkItems, listMyWorkItemsTool } from './tools/list-my-work-items.js';
import { createWorkItem, createWorkItemTool } from './tools/create-work-item.js';
import { updateWorkItem, updateWorkItemTool } from './tools/update-work-item.js';
import { addWorkItemComment, addWorkItemCommentTool } from './tools/add-work-item-comment.js';
import { linkWorkItem, linkWorkItemTool } from './tools/link-work-item.js';
import { listRepositories, listRepositoriesTool } from './tools/list-repositories.js';
import { listBranches, listBranchesTool } from './tools/list-branches.js';
import { createBranch, createBranchTool } from './tools/create-branch.js';
import { listCommits, listCommitsTool } from './tools/list-commits.js';
import { getCommit, getCommitTool } from './tools/get-commit.js';
import { compareBranches, compareBranchesTool } from './tools/compare-branches.js';
import { createPr, createPrTool } from './tools/create-pr.js';
import { updatePr, updatePrTool } from './tools/update-pr.js';
import { abandonPr, abandonPrTool } from './tools/abandon-pr.js';
import { reactivatePr, reactivatePrTool } from './tools/reactivate-pr.js';
import { addressComment, addressCommentTool } from './tools/address-comment.js';
import { getMyWork, getMyWorkTool } from './tools/get-my-work.js';
import { reportIssue, reportIssueTool } from './tools/report-issue.js';
import { editComment, editCommentTool } from './tools/edit-comment.js';
import { deleteComment, deleteCommentTool } from './tools/delete-comment.js';
import { deleteBranch, deleteBranchTool } from './tools/delete-branch.js';
import { deleteWorkItem, deleteWorkItemTool } from './tools/delete-work-item.js';
import { queryWorkItems, queryWorkItemsTool } from './tools/query-work-items.js';
import { getFileBlame, getFileBlameTool } from './tools/get-file-blame.js';
import { listDirectory, listDirectoryTool } from './tools/list-directory.js';
import { getBranchPolicies, getBranchPoliciesTool } from './tools/get-branch-policies.js';
import { getWorkItemComments, getWorkItemCommentsTool } from './tools/get-work-item-comments.js';
import { listBuilds, listBuildsTool } from './tools/list-builds.js';
import { getBuild, getBuildTool } from './tools/get-build.js';
import { triggerBuild, triggerBuildTool } from './tools/trigger-build.js';
import { cancelBuild, cancelBuildTool } from './tools/cancel-build.js';
import { getBuildLogs, getBuildLogsTool } from './tools/get-build-logs.js';
import { listSprints, listSprintsTool } from './tools/list-sprints.js';
import { getSprintBacklog, getSprintBacklogTool } from './tools/get-sprint-backlog.js';
import { moveToSprint, moveToSprintTool } from './tools/move-to-sprint.js';
import { getTeamBoard, getTeamBoardTool } from './tools/get-team-board.js';
import { listReleases, listReleasesTool } from './tools/list-releases.js';
import { getDeploymentStatus, getDeploymentStatusTool } from './tools/get-deployment-status.js';
import { approveDeployment, approveDeploymentTool } from './tools/approve-deployment.js';
import { listWikiPages, listWikiPagesTool } from './tools/list-wiki-pages.js';
import { getWikiPage, getWikiPageTool } from './tools/get-wiki-page.js';

/**
 * Create and configure MCP server
 */
const server = new Server(
  {
    name: '@om-surushe/efficient-ado',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Tool registry
 */
const tools = [
  setupWorkspaceTool,
  listPRsTool,
  getPRTool,
  startReviewTool,
  voteOnPRTool,
  manageReviewersTool,
  quickApproveTool,
  checkMergeReadinessTool,
  completePRTool,
  listCommentsTool,
  addCommentTool,
  replyToThreadTool,
  updateThreadStatusTool,
  getPRChangesTool,
  getFileDiffTool,
  getFileContentTool,
  getWorkItemTool,
  listMyWorkItemsTool,
  createWorkItemTool,
  updateWorkItemTool,
  addWorkItemCommentTool,
  linkWorkItemTool,
  listRepositoriesTool,
  listBranchesTool,
  createBranchTool,
  listCommitsTool,
  getCommitTool,
  compareBranchesTool,
  createPrTool,
  updatePrTool,
  abandonPrTool,
  reactivatePrTool,
  addressCommentTool,
  getMyWorkTool,
  reportIssueTool,
  editCommentTool,
  deleteCommentTool,
  deleteBranchTool,
  deleteWorkItemTool,
  queryWorkItemsTool,
  getFileBlameTool,
  listDirectoryTool,
  getBranchPoliciesTool,
  getWorkItemCommentsTool,
  listBuildsTool,
  getBuildTool,
  triggerBuildTool,
  cancelBuildTool,
  getBuildLogsTool,
  listSprintsTool,
  getSprintBacklogTool,
  moveToSprintTool,
  getTeamBoardTool,
  listReleasesTool,
  getDeploymentStatusTool,
  approveDeploymentTool,
  listWikiPagesTool,
  getWikiPageTool,
];

/**
 * Tool handlers
 */
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  setup_workspace: setupWorkspace,
  list_prs: listPRs,
  get_pr: getPR,
  start_review: startReview,
  vote_on_pr: voteOnPR,
  manage_reviewers: manageReviewers,
  quick_approve: quickApprove,
  check_merge_readiness: checkMergeReadiness,
  complete_pr: completePR,
  list_comments: listComments,
  add_comment: addComment,
  reply_to_thread: replyToThread,
  update_thread_status: updateThreadStatus,
  get_pr_changes: getPRChanges,
  get_file_diff: getFileDiff,
  get_file_content: getFileContent,
  get_work_item: getWorkItem,
  list_my_work_items: listMyWorkItems,
  create_work_item: createWorkItem,
  update_work_item: updateWorkItem,
  add_work_item_comment: addWorkItemComment,
  link_work_item: linkWorkItem,
  list_repositories: listRepositories,
  list_branches: listBranches,
  create_branch: createBranch,
  list_commits: listCommits,
  get_commit: getCommit,
  compare_branches: compareBranches,
  create_pr: createPr,
  update_pr: updatePr,
  abandon_pr: abandonPr,
  reactivate_pr: reactivatePr,
  address_comment: addressComment,
  get_my_work: getMyWork,
  report_issue: reportIssue,
  edit_comment: editComment,
  delete_comment: deleteComment,
  delete_branch: deleteBranch,
  delete_work_item: deleteWorkItem,
  query_work_items: queryWorkItems,
  get_file_blame: getFileBlame,
  list_directory: listDirectory,
  get_branch_policies: getBranchPolicies,
  get_work_item_comments: getWorkItemComments,
  list_builds: listBuilds,
  get_build: getBuild,
  trigger_build: triggerBuild,
  cancel_build: cancelBuild,
  get_build_logs: getBuildLogs,
  list_sprints: listSprints,
  get_sprint_backlog: getSprintBacklog,
  move_to_sprint: moveToSprint,
  get_team_board: getTeamBoard,
  list_releases: listReleases,
  get_deployment_status: getDeploymentStatus,
  approve_deployment: approveDeployment,
  list_wiki_pages: listWikiPages,
  get_wiki_page: getWikiPage,
};

/**
 * Handle list_tools request
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

/**
 * Handle call_tool request
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = toolHandlers[name];
  if (!handler) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: 'UNKNOWN_TOOL',
                message: `Unknown tool: ${name}`,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  try {
    const result = await handler(args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: 'TOOL_ERROR',
                message: error instanceof Error ? error.message : 'Tool execution failed',
                details: error,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
});

/**
 * Start server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Efficient ADO MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
