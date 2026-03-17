/**
 * get_build_logs tool
 * Retrieve log output from a build
 */

import { z } from 'zod';
import { getBuildApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const GetBuildLogsSchema = z.object({
  buildId: z.number().describe('Build ID'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  logId: z.number().optional().describe('Specific log ID to fetch content for (from get_build with includeLogs=true). If omitted, lists all available logs.'),
  tail: z.number().optional().default(100).describe('Number of lines to return from end of log (default: 100, max: 1000)'),
});

export type GetBuildLogsInput = z.infer<typeof GetBuildLogsSchema>;

export async function getBuildLogs(input: GetBuildLogsInput): Promise<ToolResponse> {
  try {
    const params = GetBuildLogsSchema.parse(input);
    const project = getProject(params.project);
    const buildApi = await getBuildApi();

    const logs = await buildApi.getBuildLogs(project, params.buildId);

    if (!logs || logs.length === 0) {
      return {
        success: true,
        data: {
          buildId: params.buildId,
          logs: [],
          message: 'No logs available for this build yet',
        },
      };
    }

    if (params.logId !== undefined) {
      // Fetch content for specific log
      const tail = Math.min(params.tail ?? 100, 1000);
      const allLines = await buildApi.getBuildLogLines(project, params.buildId, params.logId);
      const lines = allLines || [];
      const sliced = lines.slice(Math.max(0, lines.length - tail));

      return {
        success: true,
        data: {
          buildId: params.buildId,
          logId: params.logId,
          totalLines: lines.length,
          returnedLines: sliced.length,
          isTruncated: lines.length > tail,
          content: sliced.join('\n'),
          suggestedActions:
            lines.length > tail
              ? [
                  {
                    tool: 'get_build_logs',
                    params: { buildId: params.buildId, logId: params.logId, tail: 500 },
                    reason: 'Fetch more log lines',
                    priority: 'low' as const,
                  },
                ]
              : [],
        },
      };
    }

    // List all available logs
    const logList = logs.map((l: any) => ({
      id: l.id,
      type: l.type,
      lineCount: l.lineCount,
      createdOn: l.createdOn,
      lastChangedOn: l.lastChangedOn,
    }));

    return {
      success: true,
      data: {
        buildId: params.buildId,
        availableLogs: logList,
        totalLogs: logList.length,
        message: 'Use logId parameter with a specific ID to fetch log content',
        suggestedActions:
          logList.length > 0
            ? [
                {
                  tool: 'get_build_logs',
                  params: { buildId: params.buildId, logId: logList[logList.length - 1].id, tail: 100 },
                  reason: 'Fetch content of the last log (usually the most relevant)',
                  priority: 'high' as const,
                },
              ]
            : [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_BUILD_LOGS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get build logs',
        details: error,
      },
    };
  }
}

export const getBuildLogsTool = {
  name: 'get_build_logs',
  description:
    'Get logs for a build. Without logId: lists all available log files with their IDs and line counts. With logId: returns the last N lines of that log (default: 100, max: 1000). Workflow: first call without logId to see available logs, then call again with a specific logId to read content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      buildId: { type: 'number', description: 'Build ID' },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      logId: { type: 'number', description: 'Specific log ID to fetch content for. Omit to list available logs.' },
      tail: { type: 'number', description: 'Number of lines from end of log (default: 100, max: 1000)' },
    },
    required: ['buildId'],
  },
};
