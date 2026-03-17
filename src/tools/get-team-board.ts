/**
 * get_team_board tool
 * Get Kanban board columns and work item distribution
 */

import { z } from 'zod';
import { getWorkApi, getWorkItemApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const GetTeamBoardSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  team: z.string().optional().describe('Team name (uses project default team if not specified)'),
  boardName: z.string().optional().describe('Board name (e.g., "Stories", "Backlog"). Uses first board if not specified.'),
  includeWorkItems: z
    .boolean()
    .optional()
    .default(false)
    .describe('Fetch work items in each column (default: false, adds extra API calls)'),
});

export type GetTeamBoardInput = z.infer<typeof GetTeamBoardSchema>;

export async function getTeamBoard(input: GetTeamBoardInput): Promise<ToolResponse> {
  try {
    const params = GetTeamBoardSchema.parse(input);
    const project = getProject(params.project);
    const workApi = await getWorkApi();

    const teamContext = { project, ...(params.team ? { team: params.team } : {}) };

    // List available boards
    const boards = await workApi.getBoards(teamContext as any);

    if (!boards || boards.length === 0) {
      return {
        success: false,
        error: { code: 'NO_BOARDS', message: 'No boards found for this team' },
      };
    }

    // Pick the requested board or the first one
    const boardRef = params.boardName
      ? boards.find((b: any) => b.name?.toLowerCase() === params.boardName!.toLowerCase()) || boards[0]
      : boards[0];

    // Get full board details including columns
    const [board, columns, rows] = await Promise.all([
      workApi.getBoard(teamContext as any, boardRef.id!),
      workApi.getBoardColumns(teamContext as any, boardRef.id!),
      workApi.getBoardRows(teamContext as any, boardRef.id!),
    ]);

    const formattedColumns = (columns || []).map((col: any) => ({
      id: col.id,
      name: col.name,
      itemLimit: col.itemLimit,
      isSplit: col.isSplit,
      stateMappings: col.stateMappings,
    }));

    const formattedRows = (rows || []).map((row: any) => ({
      id: row.id,
      name: row.name || '(default swimlane)',
    }));

    const data: any = {
      boardId: boardRef.id,
      boardName: boardRef.name,
      availableBoards: boards.map((b: any) => ({ id: b.id, name: b.name })),
      columns: formattedColumns,
      swimlanes: formattedRows,
    };

    if (params.includeWorkItems) {
      const witApi = await getWorkItemApi();
      // Query work items for this board using WIQL
      try {
        const wiqlResult = await witApi.queryByWiql(
          {
            query: `
              SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.BoardColumn]
              FROM WorkItems
              WHERE [System.TeamProject] = @project
              AND [System.BoardColumn] <> ''
              ORDER BY [System.BoardColumn], [System.ChangedDate] DESC
            `,
          },
          { project },
          undefined,
          50
        );

        const ids = (wiqlResult.workItems || []).map((wi: any) => wi.id);
        if (ids.length > 0) {
          const items = await witApi.getWorkItems(ids, project, ['System.Id', 'System.Title', 'System.State', 'System.WorkItemType', 'System.BoardColumn', 'System.AssignedTo'], undefined, 0);
          data.workItems = (items || []).map((wi: any) => ({
            id: wi.id,
            title: wi.fields?.['System.Title'],
            type: wi.fields?.['System.WorkItemType'],
            state: wi.fields?.['System.State'],
            boardColumn: wi.fields?.['System.BoardColumn'],
            assignedTo: wi.fields?.['System.AssignedTo']?.displayName || 'Unassigned',
          }));
        } else {
          data.workItems = [];
        }
      } catch {
        data.workItems = [];
        data.workItemsNote = 'Could not fetch board work items';
      }
    }

    data.suggestedActions = [
      {
        tool: 'get_sprint_backlog',
        params: {},
        reason: 'View current sprint backlog with effort estimates',
        priority: 'medium' as const,
      },
    ];

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'GET_TEAM_BOARD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get team board',
        details: error,
      },
    };
  }
}

export const getTeamBoardTool = {
  name: 'get_team_board',
  description:
    'Get Kanban board layout for a team. Returns available boards, columns (with WIP limits), and swimlanes. Use boardName to select a specific board (defaults to first). Set includeWorkItems=true to also fetch work items on the board (extra API call).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      team: { type: 'string', description: 'Team name (uses project default team if not specified)' },
      boardName: { type: 'string', description: 'Board name (e.g., "Stories"). Uses first board if not specified.' },
      includeWorkItems: {
        type: 'boolean',
        description: 'Fetch work items in each column (default: false)',
      },
    },
  },
};
