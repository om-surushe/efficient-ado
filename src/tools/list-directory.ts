/**
 * list_directory tool
 * List files and directories at a path in a repository
 */

import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

/**
 * Input schema for list_directory
 */
export const ListDirectorySchema = z.object({
  path: z.string().optional().default('/').describe('Directory path to list (default: root "/")'),
  branch: z.string().optional().describe('Branch name (uses default branch if not specified)'),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe('List files recursively (default: false, one level only)'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  repository: z.string().optional().describe('Repository name or ID (uses default if not specified)'),
});

export type ListDirectoryInput = z.infer<typeof ListDirectorySchema>;

/**
 * List directory contents
 */
export async function listDirectory(input: ListDirectoryInput): Promise<ToolResponse> {
  try {
    const params = ListDirectorySchema.parse(input);

    const project = getProject(params.project);
    const repoId = getRepo(params.repository);
    const gitApi = await getGitApi();

    const repo = await gitApi.getRepository(repoId, project);
    const branchName = params.branch
      ? params.branch.replace(/^refs\/heads\//, '')
      : (repo.defaultBranch || 'refs/heads/main').replace('refs/heads/', '');

    // recursionLevel: 1 = OneLevel, 120 = Full
    const recursionLevel = params.recursive ? 120 : 1;

    const items = await gitApi.getItems(
      repoId,
      project,
      params.path,
      recursionLevel,
      true, // includeContentMetadata
      undefined, // latestProcessedChange
      undefined, // download
      undefined, // includeLinks
      { version: branchName }
    );

    if (!items || items.length === 0) {
      return {
        success: true,
        data: {
          path: params.path,
          branch: branchName,
          items: [],
          count: 0,
          message: 'Directory is empty or path does not exist',
        },
      };
    }

    // Filter out the directory itself (first item is the requested path)
    const entries = items
      .filter((item) => item.path !== params.path)
      .map((item) => ({
        path: item.path || '',
        name: (item.path || '').split('/').pop() || '',
        type: item.isFolder ? 'directory' : 'file',
        url: item.url || '',
      }));

    const fileCount = entries.filter((e) => e.type === 'file').length;
    const dirCount = entries.filter((e) => e.type === 'directory').length;

    return {
      success: true,
      data: {
        path: params.path,
        branch: branchName,
        items: entries,
        count: entries.length,
        stats: { files: fileCount, directories: dirCount },
        message: `Found ${fileCount} file(s) and ${dirCount} director(ies) in ${params.path}`,
        suggestedActions:
          entries.length > 0
            ? [
                {
                  tool: 'list_directory',
                  params: {
                    path: entries.find((e) => e.type === 'directory')?.path || params.path,
                    branch: branchName,
                  },
                  reason: 'Browse a subdirectory',
                  priority: 'low' as const,
                },
              ]
            : [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_DIRECTORY_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list directory',
        details: error,
      },
    };
  }
}

/**
 * Tool metadata for MCP
 */
export const listDirectoryTool = {
  name: 'list_directory',
  description:
    'List files and directories at a given path in a repository. Returns file names and types (file/directory). Use this to explore the repository structure before reading files. Supports recursive listing.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (default: root "/")',
        default: '/',
      },
      branch: {
        type: 'string',
        description: 'Branch name (uses default branch if not specified)',
      },
      recursive: {
        type: 'boolean',
        description: 'List files recursively (default: false, one level only)',
        default: false,
      },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      repository: {
        type: 'string',
        description: 'Repository name or ID (uses default if not specified)',
      },
    },
  },
};
