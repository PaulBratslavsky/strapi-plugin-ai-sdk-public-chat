import type { Core } from '@strapi/strapi';
import type { ToolSet } from 'ai';
import { tool, zodSchema } from 'ai';

/**
 * Build the toolset for anonymous traffic.
 *
 * Pulls tool definitions out of ai-sdk's registry by exact name rather than
 * redefining them, so the shared `tool-logic/` layer stays the single
 * implementation. What makes this safe is the direction of the check: it is an
 * allow-list, so a tool only appears if config names it. Adding a tool to
 * ai-sdk — or installing another plugin that contributes tools — cannot widen
 * this surface.
 *
 * That inversion is the reason this plugin exists. When public chat lived
 * inside ai-sdk it filtered by a `publicSafe` flag on the tool itself, which
 * meant a tool author decided what anonymous visitors could reach, and a
 * missing flag failed open.
 */
export function createPublicTools(
  strapi: Core.Strapi,
  allowedTools: string[],
  allowedContentTypes: string[],
): ToolSet {
  if (allowedTools.length === 0) return {};

  const aiSdk = strapi.plugin('ai-sdk') as unknown as { toolRegistry?: any } | undefined;
  const registry = aiSdk?.toolRegistry;

  if (!registry) {
    strapi.log.error(
      '[ai-sdk-public-chat] strapi-plugin-ai-sdk is not installed or has not booted; ' +
        'public chat will run with no tools.',
    );
    return {};
  }

  const allowedTypes = new Set(allowedContentTypes);
  const tools: ToolSet = {};

  for (const name of allowedTools) {
    const def = registry.get(name);

    if (!def) {
      strapi.log.warn(
        `[ai-sdk-public-chat] allowedTools names "${name}", which is not registered. ` +
          'Check the spelling against ai-sdk\'s tool registry — the tool is being skipped.',
      );
      continue;
    }

    tools[name] = tool({
      description: def.description,
      inputSchema: zodSchema(def.schema) as any,
      execute: async (args: any) => {
        // Second gate: even an allowed content tool may only touch allowed
        // types. Without this, naming `searchContent` would expose every
        // content type in the project.
        if (typeof args?.contentType === 'string' && !allowedTypes.has(args.contentType)) {
          return {
            error: `Content type "${args.contentType}" is not available here.`,
            availableContentTypes: [...allowedTypes],
          };
        }
        return def.execute(args, strapi, {});
      },
    });
  }

  return tools;
}

/** Short description of the active toolset, for the system prompt. */
export function describeTools(tools: ToolSet): string {
  const names = Object.keys(tools);
  if (names.length === 0) return 'You have no tools available. Answer from the conversation alone.';
  return names.map((n) => `- ${n}: ${(tools[n] as any).description ?? ''}`).join('\n');
}
