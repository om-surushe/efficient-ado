/**
 * list_wiki_pages tool
 * List wiki pages in a project wiki
 */

import { z } from 'zod';
import { getWikiApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const ListWikiPagesSchema = z.object({
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  wikiIdentifier: z
    .string()
    .optional()
    .describe('Wiki name or ID. Uses first wiki found for the project if not specified.'),
  top: z.number().optional().default(50).describe('Maximum pages to return (default: 50)'),
});

export type ListWikiPagesInput = z.infer<typeof ListWikiPagesSchema>;

export async function listWikiPages(input: ListWikiPagesInput): Promise<ToolResponse> {
  try {
    const params = ListWikiPagesSchema.parse(input);
    const project = getProject(params.project);
    const wikiApi = await getWikiApi();

    // Find the wiki to use
    let wikiId = params.wikiIdentifier;
    let wikiName: string | undefined;

    if (!wikiId) {
      const wikis = await wikiApi.getAllWikis(project);
      if (!wikis || wikis.length === 0) {
        return {
          success: false,
          error: {
            code: 'NO_WIKI',
            message: 'No wiki found for this project',
          },
        };
      }
      wikiId = wikis[0].id!;
      wikiName = wikis[0].name;
    }

    // Use getPagesBatch to list pages
    const pagesBatch = await wikiApi.getPagesBatch(
      { top: params.top } as any,
      project,
      wikiId
    );

    const pages = (pagesBatch as any) || [];
    const pageList = Array.isArray(pages) ? pages : (pages.value || []);

    const formatted = pageList.map((p: any) => ({
      id: p.id,
      path: p.path,
      order: p.order,
      isParentPage: p.isParentPage,
      gitItemPath: p.gitItemPath,
    }));

    return {
      success: true,
      data: {
        wikiId,
        wikiName: wikiName || wikiId,
        pages: formatted,
        count: formatted.length,
        suggestedActions:
          formatted.length > 0
            ? [
                {
                  tool: 'get_wiki_page',
                  params: { path: formatted[0].path, wikiIdentifier: wikiId },
                  reason: `Read wiki page "${formatted[0].path}"`,
                  priority: 'medium' as const,
                },
              ]
            : [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'LIST_WIKI_PAGES_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list wiki pages',
        details: error,
      },
    };
  }
}

export const listWikiPagesTool = {
  name: 'list_wiki_pages',
  description:
    'List pages in a project wiki. Automatically finds the project wiki if wikiIdentifier is not provided. Returns page paths, IDs, and hierarchy info. Use get_wiki_page to read the content of a specific page.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      wikiIdentifier: {
        type: 'string',
        description: 'Wiki name or ID. Uses first project wiki if not specified.',
      },
      top: { type: 'number', description: 'Maximum pages to return (default: 50)' },
    },
  },
};
