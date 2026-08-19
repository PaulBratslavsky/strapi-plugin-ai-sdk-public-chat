import type { Core } from '@strapi/strapi';
import type { ToolSet } from 'ai';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';

/**
 * This plugin defines its own tools rather than pulling them from
 * strapi-plugin-ai-sdk's registry.
 *
 * Borrowing that registry meant anonymous visitors could reach any tool
 * registered by any installed plugin, with only a config allow-list standing
 * between them and a write tool. That allow-list is a filter over a growing
 * set — the wrong direction. These three are read-only by construction: there
 * is no create, update, upload, or send tool here to allow by mistake.
 *
 * Every tool is additionally bounded by `allowedContentTypes`. An empty list
 * means the tools exist but can reach nothing, which is the safe default for a
 * surface reachable by anyone on the internet.
 */

const MAX_PAGE_SIZE = 25;
const LARGE_FIELDS = new Set(['content', 'blocks', 'body', 'richText', 'markdown', 'html']);

/** Strip bulky fields so a single result cannot blow the context window. */
function trim(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (LARGE_FIELDS.has(k) && typeof v === 'string' && v.length > 500) {
      out[k] = `${v.slice(0, 500)}… (truncated)`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deny(allowed: string[]) {
  return {
    error: 'That content is not available here.',
    availableContentTypes: allowed,
  };
}

export function createPublicTools(strapi: Core.Strapi, allowedContentTypes: string[]): ToolSet {
  const allowed = new Set(allowedContentTypes);
  const list = [...allowed];

  const contentTypeField = z
    .string()
    .describe(`Content type UID. Must be one of: ${list.join(', ') || '(none configured)'}`);

  return {
    listContentTypes: tool({
      description: 'List the content types available to search, with their fields.',
      inputSchema: zodSchema(z.object({})) as any,
      execute: async () => {
        return list.map((uid) => {
          const ct = strapi.contentTypes[uid as keyof typeof strapi.contentTypes] as any;
          return {
            uid,
            displayName: ct?.info?.displayName ?? uid,
            fields: ct?.attributes ? Object.keys(ct.attributes) : [],
          };
        });
      },
    }),

    searchContent: tool({
      description: 'Search a content type. Returns a page of matching documents.',
      inputSchema: zodSchema(
        z.object({
          contentType: contentTypeField,
          query: z.string().optional().describe('Text to search for'),
          field: z
            .string()
            .optional()
            .default('title')
            .describe('Field to search in when `query` is given'),
          page: z.number().optional().default(1),
          pageSize: z.number().optional().default(10).describe(`Max ${MAX_PAGE_SIZE}`),
        }),
      ) as any,
      execute: async (args: any) => {
        if (!allowed.has(args.contentType)) return deny(list);

        const pageSize = Math.min(args.pageSize ?? 10, MAX_PAGE_SIZE);
        const filters = args.query
          ? { [args.field ?? 'title']: { $containsi: args.query } }
          : undefined;

        try {
          const docs = await strapi.documents(args.contentType).findMany({
            ...(filters ? { filters } : {}),
            start: ((args.page ?? 1) - 1) * pageSize,
            limit: pageSize,
            status: 'published',
          });
          return { count: docs.length, results: docs.map((d: any) => trim(d)) };
        } catch (error) {
          strapi.log.warn(`[ai-sdk-public-chat] searchContent failed: ${String(error)}`);
          return { error: 'Search failed.' };
        }
      },
    }),

    findOneContent: tool({
      description: 'Fetch a single document by its documentId.',
      inputSchema: zodSchema(
        z.object({
          contentType: contentTypeField,
          documentId: z.string().describe('The documentId to fetch'),
        }),
      ) as any,
      execute: async (args: any) => {
        if (!allowed.has(args.contentType)) return deny(list);

        try {
          const doc = await strapi.documents(args.contentType).findOne({
            documentId: args.documentId,
            status: 'published',
          });
          if (!doc) return { error: 'Not found.' };
          return trim(doc as Record<string, unknown>);
        } catch (error) {
          strapi.log.warn(`[ai-sdk-public-chat] findOneContent failed: ${String(error)}`);
          return { error: 'Lookup failed.' };
        }
      },
    }),
  };
}

/** Short description of the active toolset, for the system prompt. */
export function describeTools(tools: ToolSet): string {
  const names = Object.keys(tools);
  if (names.length === 0) return 'You have no tools. Answer from the conversation alone.';
  return names.map((n) => `- ${n}: ${(tools[n] as any).description ?? ''}`).join('\n');
}
