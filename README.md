# @om-surushe/efficient-ado

> LLM-optimized Azure DevOps workflows for AI assistants

[![npm version](https://img.shields.io/npm/v/@om-surushe/efficient-ado)](https://www.npmjs.com/package/@om-surushe/efficient-ado)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/om-surushe/efficient-ado/workflows/CI/badge.svg)](https://github.com/om-surushe/efficient-ado/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-18%2B-green.svg)](https://nodejs.org/)

**Efficient ADO** is a Model Context Protocol (MCP) server that provides AI assistants with streamlined access to Azure DevOps. Built with agent-first design principles, it minimizes round trips, reduces token usage, and provides rich contextual responses.

## Features

- 🎯 **Agent-First Design** - Composite tools reduce round trips
- ⚡ **Token Efficient** - Tiered responses (summary/standard/detailed)
- 🤖 **LLM-Optimized** - Rich context + suggested actions in every response
- 🚀 **Fast** - Built with TypeScript, optimized for performance
- 📦 **Complete** - 34 tools covering PRs, work items, repos, branches
- 🔄 **Composite Workflows** - Multi-step operations in single calls
- 🧠 **Error Guidance** - Errors tell agents HOW to fix issues

## Installation

```bash
npm install @om-surushe/efficient-ado
```

## Quick Start

### Configuration

Create a `.env` file:

```bash
AZDO_ORG_URL=https://dev.azure.com/your-org
AZDO_PAT=your-personal-access-token
AZDO_PROJECT=your-project  # optional
AZDO_REPO=your-repo        # optional
```

**PAT Requirements:**
- Code (Read & Write)
- Pull Request Threads (Read & Write)
- Work Items (Read & Write)

### Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "efficient-ado": {
      "command": "npx",
      "args": ["@om-surushe/efficient-ado"],
      "env": {
        "AZDO_ORG_URL": "https://dev.azure.com/your-org",
        "AZDO_PAT": "your-pat-here",
        "AZDO_PROJECT": "your-project",
        "AZDO_REPO": "your-repo"
      }
    }
  }
}
```

### Usage with OpenClaw / Cline / Other MCP Clients

Similar configuration - use stdio transport with environment variables.

## Available Tools (34 Total)

### Foundation

- **`setup_workspace`** - Configure credentials and verify connection

### Pull Request Workflows

**Discovery:**
- **`list_prs`** - List PRs with filters (creator, reviewer, status)
- **`get_pr`** - Get PR details with reviewers and status
- **`start_review`** - **COMPOSITE** - Get PR + comments + reviewers in one call

**Review & Approval:**
- **`vote_on_pr`** - Approve (10), approve with suggestions (5), wait (-5), reject (-10)
- **`manage_reviewers`** - Add/remove reviewers
- **`quick_approve`** - **COMPOSITE** - Approve + merge if ready

**Merge:**
- **`check_merge_readiness`** - Verify all merge requirements
- **`complete_pr`** - Merge PR with completion options

**Comments & Threads:**
- **`list_comments`** - List all threads (general + inline)
- **`add_comment`** - Add general or inline comment
- **`reply_to_thread`** - Reply to existing thread
- **`update_thread_status`** - Mark thread as fixed/active/wontFix/closed
- **`address_comment`** - **COMPOSITE** - Reply + resolve in one call

**Files & Diffs:**
- **`get_pr_changes`** - List changed files with stats
- **`get_file_diff`** - Get file diff (side-by-side comparison)
- **`get_file_content`** - Get file content at PR commit

**PR Lifecycle:**
- **`create_pr`** - Create PR with work items, reviewers, auto-complete
- **`update_pr`** - Update title, description, draft status
- **`abandon_pr`** - Close PR without merging
- **`reactivate_pr`** - Reopen abandoned PR

### Work Items

- **`get_work_item`** - Get work item by ID with relations
- **`list_my_work_items`** - List work items assigned to you
- **`create_work_item`** - Create new task/bug/story
- **`update_work_item`** - Update work item fields
- **`add_work_item_comment`** - Add discussion comment
- **`link_work_item`** - Link work items (parent/child/related)

### Repos & Branches

- **`list_repositories`** - List repos in project
- **`list_branches`** - List branches in repo
- **`create_branch`** - Create new branch from source
- **`list_commits`** - List commits with filters
- **`get_commit`** - Get commit details
- **`compare_branches`** - Compare two branches

### Daily Workflow

- **`get_my_work`** - **COMPOSITE** - Dashboard: my PRs + reviews + work items

## Usage Examples

### Daily Standup

```
> "What do I need to work on today?"

Agent uses: get_my_work()

Response includes:
- PRs you created (3 active, 1 draft)
- PRs needing your review (2 pending vote)
- Work items assigned to you (5 tasks, 2 bugs)
```

### Code Review

```
> "Review PR #1805"

Agent uses: start_review(prId=1805)

Gets in one call:
- PR details (title, description, status, branches)
- All comment threads (23 general + 5 inline)
- Reviewers and their votes
- Changed files overview
```

Then:
```
> "Show me the changes to config.ts"

Agent uses: get_file_diff(prId=1805, path="config.ts")

Returns side-by-side diff with line numbers
```

### Addressing Feedback

```
> "Reply 'Fixed indentation' and mark thread 12345 as resolved"

Agent uses: address_comment(
  prId=1805,
  threadId=12345,
  reply="Fixed indentation",
  status="fixed"
)

One call handles both reply and status update
```

### Approving & Merging

```
> "Approve PR #1805 and merge if ready"

Agent uses: quick_approve(prId=1805)

One call:
1. Approves PR (vote=10)
2. Checks merge requirements
3. Merges if all policies pass
4. Or tells you what's blocking
```

### Creating Work from Feedback

```
> "Create a bug for the memory leak in thread 12345"

Agent uses:
1. list_comments(prId=1805) to get thread details
2. create_work_item(
     type="Bug",
     title="Memory leak in cache handler",
     description="Details from PR review..."
   )
3. link_work_item(workItemId=123, prId=1805)

Three calls link bug to the PR discussion
```

## Design Philosophy

### Agent-First

Every tool response includes:
- **Current state** - What's happening now
- **Statistics** - Quick metrics
- **Blockers** - What's preventing progress (if any)
- **Suggested actions** - What to do next with exact tool names

### Token Efficient

Responses have levels:
- **Summary** (~200 tokens) - Quick status check
- **Standard** (~800 tokens) - Most common use
- **Detailed** (~3000 tokens) - When agent needs everything

### Error Messages That Help

Errors tell agents HOW to fix issues:

```json
{
  "error": {
    "code": "MERGE_BLOCKED",
    "blockers": [
      {
        "reason": "Insufficient approvals (1/2)",
        "howToFix": "Call vote_on_pr(vote=10) to approve",
        "relatedTools": ["vote_on_pr"]
      }
    ]
  }
}
```

## Development

```bash
git clone https://github.com/om-surushe/efficient-ado.git
cd efficient-ado
npm install
npm run build
```

## Status

- [x] **Phase 1:** Foundation + setup
- [x] **Phase 2:** Pull request workflows (15 tools)
- [x] **Phase 3:** Work items (6 tools)
- [x] **Phase 4:** Repos & branches (6 tools)
- [x] **Phase 5:** PR creation & update (4 tools)
- [x] **Phase 6:** Composite workflows (2 tools)

**Total:** 34 tools complete and ready for use! 🎉

## Future Enhancements

- [ ] Pipeline/build tools
- [ ] Team/project management
- [ ] Wiki/documentation tools
- [ ] Artifact management
- [ ] Test plan integration

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**Om Surushe**
- GitHub: [@om-surushe](https://github.com/om-surushe)
- npm: [@om-surushe](https://www.npmjs.com/~om-surushe)

## Related Packages

- [@om-surushe/efficient-ticktick](https://www.npmjs.com/package/@om-surushe/efficient-ticktick) - LLM-optimized TickTick task management
- [@om-surushe/efficient-search](https://www.npmjs.com/package/@om-surushe/efficient-search) - LLM-optimized web search

---

Part of the **Efficient MCP** series - LLM-optimized tools for AI assistants.
