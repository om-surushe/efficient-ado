/**
 * Centralized ADO API constants — replaces magic numbers throughout the codebase
 */

/** PR status codes from ADO Git API */
export const PR_STATUS = {
  ACTIVE: 1,
  ABANDONED: 2,
  COMPLETED: 3,
} as const;

/** Thread status codes from ADO Git API */
export const THREAD_STATUS = {
  ACTIVE: 1,
  FIXED: 2,
  WONT_FIX: 3,
  CLOSED: 4,
  BY_DESIGN: 5,
  PENDING: 6,
} as const;

/** Merge status codes from ADO Git API */
export const MERGE_STATUS = {
  NOT_SET: 0,
  QUEUED: 1,
  CONFLICTS: 2,
  SUCCEEDED: 3,
  REJECTED_BY_POLICY: 4,
  FAILURE: 5,
} as const;

/** Reviewer vote values from ADO Git API */
export const VOTE = {
  APPROVED: 10,
  APPROVED_WITH_SUGGESTIONS: 5,
  NO_VOTE: 0,
  WAITING_FOR_AUTHOR: -5,
  REJECTED: -10,
} as const;

/** Vote value to human-readable label */
export const VOTE_LABELS: Record<number, string> = {
  10: 'approved',
  5: 'approved with suggestions',
  0: 'no vote',
  [-5]: 'waiting for author',
  [-10]: 'rejected',
};

/** File change type codes from ADO Git API */
export const CHANGE_TYPE = {
  ADD: 1,
  EDIT: 2,
  DELETE: 4,
  RENAME: 8,
  ENCODING_CHANGE: 16,
} as const;

/** Work item allowed types (whitelist for WIQL safety) */
export const WORK_ITEM_TYPES = [
  'Task',
  'Bug',
  'User Story',
  'Feature',
  'Epic',
  'Issue',
  'Test Case',
  'Impediment',
] as const;

export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];
