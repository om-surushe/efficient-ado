/**
 * Thread status mapping utilities
 * Centralizes ADO status code <-> string conversion used across thread tools
 */

import { ThreadStatus } from '../types.js';

export function threadStatusToNumber(status: string): number {
  switch (status) {
    case 'active':
      return 1;
    case 'fixed':
      return 2;
    case 'wontFix':
      return 3;
    case 'closed':
      return 4;
    case 'byDesign':
      return 5;
    case 'pending':
      return 6;
    default:
      return 1;
  }
}

export function threadNumberToStatus(status: number | undefined): ThreadStatus {
  switch (status) {
    case 1:
      return 'active';
    case 2:
      return 'fixed';
    case 3:
      return 'wontFix';
    case 4:
      return 'closed';
    case 5:
      return 'byDesign';
    case 6:
      return 'pending';
    default:
      return 'active';
  }
}
