# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-09

### Added

**Foundation (1 tool):**
- `setup_workspace` - Configure credentials and verify connection

**Pull Request Workflows (15 tools):**
- `list_prs` - List PRs with filters
- `get_pr` - Get PR details
- `start_review` - **COMPOSITE** - Get PR + comments + reviewers
- `vote_on_pr` - Approve/reject/feedback on PR
- `manage_reviewers` - Add/remove reviewers
- `quick_approve` - **COMPOSITE** - Approve + merge in one call
- `check_merge_readiness` - Verify merge requirements
- `complete_pr` - Merge PR
- `list_comments` - List all threads
- `add_comment` - Add general or inline comment
- `reply_to_thread` - Reply to existing thread
- `update_thread_status` - Mark thread resolved/active/etc
- `get_pr_changes` - List changed files with stats
- `get_file_diff` - Get file diff (side-by-side)
- `get_file_content` - Get file content at PR commit

**PR Lifecycle (4 tools):**
- `create_pr` - Create PR with work items, reviewers, auto-complete
- `update_pr` - Update PR title, description, draft status
- `abandon_pr` - Close PR without merging
- `reactivate_pr` - Reopen abandoned PR

**Work Items (6 tools):**
- `get_work_item` - Get work item by ID
- `list_my_work_items` - List assigned work items
- `create_work_item` - Create new task/bug/story
- `update_work_item` - Update work item fields
- `add_work_item_comment` - Add discussion comment
- `link_work_item` - Link work items (parent/child/related)

**Repos & Branches (6 tools):**
- `list_repositories` - List repos in project
- `list_branches` - List branches in repo
- `create_branch` - Create new branch
- `list_commits` - List commits with filters
- `get_commit` - Get commit details
- `compare_branches` - Compare two branches

**Workflow Composites (2 tools):**
- `address_comment` - **COMPOSITE** - Reply + resolve in one call
- `get_my_work` - **COMPOSITE** - Dashboard of my PRs + reviews + work items

**Meta (1 tool):**
- `report_issue` - Get instructions and template for reporting bugs

**Total:** 35 tools covering complete Azure DevOps workflows

### Features

- **Agent-First Design** - Every response includes state, stats, blockers, suggested actions
- **Tiered Responses** - summary (~200 tokens), standard (~800), detailed (~3000)
- **Composite Workflows** - Multi-step operations in single calls
- **Smart Error Handling** - Errors tell agents HOW to fix issues
- **Type Safety** - Full TypeScript + Zod validation
- **Token Efficient** - Context-rich but optimized for LLM consumption

### Tested Against

- Azure DevOps Cloud (loopr-ai organization)
- Project: root
- Repository: loopriq-inspect
- Test PR: #1805 (full CRUD on threads, voting, merge checks)

### Known Limitations

- Azure DevOps API does not provide unified diffs - use `get_file_content(includeOriginal=true)` for side-by-side comparison instead

[0.1.0]: https://github.com/om-surushe/efficient-ado/releases/tag/v0.1.0
