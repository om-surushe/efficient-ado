/**
 * Core type definitions for Efficient ADO MCP
 */

import { z } from 'zod';

/**
 * Configuration schema
 */
export const ConfigSchema = z.object({
  orgUrl: z.string().url(),
  pat: z.string().min(1),
  project: z.string().optional(),
  repo: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Response level for controlling detail/token usage
 */
export type ResponseLevel = 'summary' | 'standard' | 'detailed';

/**
 * PR Phase in lifecycle
 */
export type PRPhase = 'draft' | 'review' | 'approved' | 'merge_ready' | 'blocked' | 'completed';

/**
 * PR Status from ADO API
 */
export type PRStatus = 'draft' | 'active' | 'completed' | 'abandoned';

/**
 * Vote type
 */
export type VoteType = -10 | -5 | 0 | 5 | 10;

/**
 * Thread status
 */
export type ThreadStatus = 'active' | 'fixed' | 'closed' | 'wontFix' | 'byDesign' | 'pending';

/**
 * Blocker type
 */
export interface Blocker {
  type: 'policy' | 'approval' | 'build' | 'conflict' | 'thread';
  message: string;
  howToFix: string;
  relatedTools?: string[];
}

/**
 * Suggested action
 */
export interface SuggestedAction {
  tool: string;
  params: Record<string, any>;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Pull Request Context (agent-optimized)
 */
export interface PRContext {
  // Core PR data
  pr: {
    id: number;
    title: string;
    description: string;
    status: PRStatus;
    isDraft: boolean;
    createdBy: string;
    creationDate: string;
    sourceBranch: string;
    targetBranch: string;
    repository: string;
    url: string;
  };

  // Quick stats (always included)
  stats: {
    comments: {
      total: number;
      unresolved: number;
    };
    votes: {
      approve: number;
      reject: number;
      waiting: number;
      noVote: number;
    };
    files: {
      changed: number;
      additions: number;
      deletions: number;
    };
    commits: number;
    requiredReviewers: {
      total: number;
      approved: number;
    };
  };

  // Current state (always included)
  state: {
    phase: PRPhase;
    canMerge: boolean;
    blockers: Blocker[];
    warnings: string[];
  };

  // Suggested actions (always included)
  suggestedActions: SuggestedAction[];

  // Optional detailed data (only if requested)
  comments?: CommentThread[];
  files?: FileChange[];
  reviewers?: Reviewer[];
}

/**
 * Comment Thread
 */
export interface CommentThread {
  id: number;
  status: ThreadStatus;
  comments: Array<{
    id: number;
    content: string;
    author: string;
    publishedDate: string;
    commentType: 'text' | 'system';
  }>;

  // Context for inline comments
  context?: {
    filePath: string;
    line: number;
    codeSnippet?: string;
    changeType: 'add' | 'edit' | 'delete';
  };

  canResolve: boolean;
}

/**
 * File Change
 */
export interface FileChange {
  path: string;
  changeType: 'add' | 'edit' | 'delete' | 'rename';
  additions: number;
  deletions: number;
  commentThreads?: number[]; // Thread IDs on this file
}

/**
 * Reviewer
 */
export interface Reviewer {
  id: string;
  displayName: string;
  isRequired: boolean;
  vote: VoteType;
  voteLabel?: string;
  hasDeclined: boolean;
}

/**
 * Error response
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Success response wrapper
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

export type ToolResponse<T = any> = SuccessResponse<T> | ErrorResponse;
