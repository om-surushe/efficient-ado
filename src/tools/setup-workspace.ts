/**
 * setup_workspace tool
 * Configure Azure DevOps authentication and workspace settings
 */

import { z } from 'zod';
import { setConfig, isConfigured } from '../config.js';
import { resetClient } from '../client.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for setup_workspace
 */
export const SetupWorkspaceSchema = z.object({
  orgUrl: z
    .string()
    .url()
    .describe('Azure DevOps organization URL (e.g., https://dev.azure.com/myorg)'),
  pat: z.string().min(1).describe('Personal Access Token with appropriate permissions'),
  project: z.string().optional().describe('Default project name'),
  repo: z.string().optional().describe('Default repository name'),
});

export type SetupWorkspaceInput = z.infer<typeof SetupWorkspaceSchema>;

/**
 * Setup workspace configuration
 */
export async function setupWorkspace(input: SetupWorkspaceInput): Promise<ToolResponse> {
  try {
    // Validate input
    const config = SetupWorkspaceSchema.parse(input);

    // Set configuration
    setConfig(config);

    // Reset client to use new config
    resetClient();

    return {
      success: true,
      data: {
        message: 'Azure DevOps workspace configured successfully',
        config: {
          orgUrl: config.orgUrl,
          project: config.project || '(not set - specify per tool call)',
          repo: config.repo || '(not set - specify per tool call)',
        },
        nextSteps: [
          'Use list_prs() to see available pull requests',
          'Use get_my_work() to see your assigned work',
          'Use list_repositories() to see available repositories',
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'SETUP_FAILED',
        message: error instanceof Error ? error.message : 'Failed to setup workspace',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const setupWorkspaceTool = {
  name: 'setup_workspace',
  description:
    'Configure Azure DevOps authentication and workspace settings. Call this first to set up credentials and defaults. PAT requires Code (Read & Write) and Pull Request Threads (Read & Write) permissions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      orgUrl: {
        type: 'string',
        description: 'Azure DevOps organization URL (e.g., https://dev.azure.com/myorg)',
      },
      pat: {
        type: 'string',
        description: 'Personal Access Token with Code and PR permissions',
      },
      project: {
        type: 'string',
        description: 'Default project name (optional - can be specified per tool call)',
      },
      repo: {
        type: 'string',
        description: 'Default repository name (optional - can be specified per tool call)',
      },
    },
    required: ['orgUrl', 'pat'],
  },
};
