import type { Core } from '@strapi/strapi';
import type { UIMessage } from 'ai';
import { convertToModelMessages, generateText, stepCountIs, streamText } from 'ai';
import type { PublicChatConfig } from '../config';
import { createPublicTools, describeTools } from '../lib/tools';
import { resolveModel } from '../lib/provider';

const PREAMBLE =
  'You are a helpful assistant for visitors to this website. ' +
  'Answer using only the tools and information available to you. ' +
  'If you cannot answer, say so plainly rather than guessing.';

/** Keep the last N messages. */
function trimMessages(messages: UIMessage[], max: number): UIMessage[] {
  return messages.length <= max ? messages : messages.slice(-max);
}

function cfg(strapi: Core.Strapi): PublicChatConfig {
  return strapi.config.get<PublicChatConfig>('plugin::ai-sdk-public-chat');
}

/**
 * Public memories are optional and read from a configurable content type.
 *
 * Defaults to unset, so this plugin does not require any particular content
 * type to exist. Point it at one — including ai-sdk's
 * `plugin::ai-sdk.public-memory` if you already have data there — to inject
 * those documents into the prompt.
 */
async function loadMemories(strapi: Core.Strapi, uid: string | undefined): Promise<string> {
  if (!uid) return '';

  try {
    const memories = await strapi.documents(uid as any).findMany({
      fields: ['content', 'category'],
      sort: { createdAt: 'desc' },
    });
    if (!memories.length) return '';
    const lines = memories.map((m: any) => `- [${m.category ?? 'note'}] ${m.content}`);
    return `\n\nBackground knowledge:\n${lines.join('\n')}`;
  } catch (error) {
    strapi.log.warn(
      `[ai-sdk-public-chat] could not read memories from "${uid}": ${String(error)}`,
    );
    return '';
  }
}

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async ask(prompt: string, options?: { system?: string }): Promise<string> {
    const config = cfg(strapi);
    const result = await generateText({
      model: resolveModel(strapi, config.chatModel!),
      system: options?.system ?? config.systemPrompt ?? PREAMBLE,
      prompt,
      ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
    });
    return result.text;
  },

  async askStream(prompt: string, options?: { system?: string }): Promise<AsyncIterable<string>> {
    const config = cfg(strapi);
    const result = streamText({
      model: resolveModel(strapi, config.chatModel!),
      system: options?.system ?? config.systemPrompt ?? PREAMBLE,
      prompt,
      ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
    });
    return result.textStream;
  },

  async chat(messages: UIMessage[]) {
    const config = cfg(strapi);

    const trimmed = trimMessages(messages, config.maxConversationMessages);
    const modelMessages = await convertToModelMessages(trimmed);
    const tools = createPublicTools(strapi, config.allowedContentTypes);

    let system = [PREAMBLE, config.systemPrompt, describeTools(tools)].filter(Boolean).join('\n\n');
    system += await loadMemories(strapi, config.publicMemoryContentType);

    return streamText({
      model: resolveModel(strapi, config.chatModel!),
      messages: modelMessages,
      system,
      tools,
      ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
      stopWhen: stepCountIs(config.maxSteps),
    });
  },
});

export default service;
