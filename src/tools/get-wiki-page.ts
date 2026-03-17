/**
 * get_wiki_page tool
 * Get content of a wiki page
 */

import { z } from 'zod';
import { getWikiApi } from '../client.js';
import { getProject } from '../config.js';
import { ToolResponse } from '../types.js';

export const GetWikiPageSchema = z.object({
  path: z.string().describe('Wiki page path (e.g., "/Home" or "/Architecture/Overview")'),
  project: z.string().optional().describe('Project name (uses default if not specified)'),
  wikiIdentifier: z
    .string()
    .optional()
    .describe('Wiki name or ID. Uses first wiki found for the project if not specified.'),
});

export type GetWikiPageInput = z.infer<typeof GetWikiPageSchema>;

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

export async function getWikiPage(input: GetWikiPageInput): Promise<ToolResponse> {
  try {
    const params = GetWikiPageSchema.parse(input);
    const project = getProject(params.project);
    const wikiApi = await getWikiApi();

    // Resolve wiki identifier
    let wikiId = params.wikiIdentifier;
    if (!wikiId) {
      const wikis = await wikiApi.getAllWikis(project);
      if (!wikis || wikis.length === 0) {
        return {
          success: false,
          error: { code: 'NO_WIKI', message: 'No wiki found for this project' },
        };
      }
      wikiId = wikis[0].id!;
    }

    // Normalize path — ensure leading slash
    const pagePath = params.path.startsWith('/') ? params.path : `/${params.path}`;

    const contentStream = await wikiApi.getPageText(
      project,
      wikiId,
      pagePath,
      undefined, // recursionLevel
      undefined, // versionDescriptor
      true       // includeContent
    );

    const content = await streamToString(contentStream);

    return {
      success: true,
      data: {
        wikiId,
        path: pagePath,
        content,
        contentLength: content.length,
        suggestedActions: [
          {
            tool: 'list_wiki_pages',
            params: { wikiIdentifier: wikiId },
            reason: 'Browse other wiki pages',
            priority: 'low' as const,
          },
        ],
      },
    };
  } catch (error: any) {
    const isNotFound =
      error?.statusCode === 404 ||
      error?.message?.includes('not found') ||
      error?.message?.includes('does not exist');

    return {
      success: false,
      error: {
        code: isNotFound ? 'PAGE_NOT_FOUND' : 'GET_WIKI_PAGE_FAILED',
        message: isNotFound
          ? `Wiki page "${input.path}" not found`
          : (error instanceof Error ? error.message : 'Failed to get wiki page'),
        details: {
          hint: 'Use list_wiki_pages to see available page paths',
          error,
        },
      },
    };
  }
}

export const getWikiPageTool = {
  name: 'get_wiki_page',
  description:
    'Get the Markdown content of a wiki page by path (e.g., "/Home", "/Architecture/Overview"). Automatically finds the project wiki if wikiIdentifier is not provided. Use list_wiki_pages to browse available page paths.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Wiki page path (e.g., "/Home" or "/Architecture/Overview")',
      },
      project: { type: 'string', description: 'Project name (uses default if not specified)' },
      wikiIdentifier: {
        type: 'string',
        description: 'Wiki name or ID. Uses first project wiki if not specified.',
      },
    },
    required: ['path'],
  },
};
