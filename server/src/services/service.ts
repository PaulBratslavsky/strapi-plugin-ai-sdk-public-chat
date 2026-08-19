import type { Core } from '@strapi/strapi';
import type { UIMessage } from 'ai';
import { convertToModelMessages, stepCountIs } from 'ai';
import type { PublicChatConfig } from '../config';
import { createPublicTools, describeTools } from '../lib/tools';

const PREAMBLE =
  'You are a helpful assistant for visitors to this website. ' +
  'Answer using only the tools and information available to you. ' +
  'If you cannot answer, say so plainly rather than guessing.';

/** ai-sdk's plugin instance, which owns the provider and the tool registry. */
interface AiSdkPlugin {
  aiProvider?: {
    streamRaw: (input: Record<string, unknown>) => Promise<any>;
    generateText: (prompt: string, options?: Record<string, unknown>) => Promise<{ text: string }>;
    streamText: (prompt: string, options?: Record<string, unknown>) => Promise<{ textStream: AsyncIterable<string> }>;
  };
  toolRegistry?: unknown;
}

/** Keep the last N messages without splitting a tool call from its result. */
function trimMessages(messages: UIMessage[], max: number): UIMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(-max);
}

function requireProvider(strapi: Core.Strapi): NonNullable<AiSdkPlugin['aiProvider']> {
  const aiSdk = strapi.plugin('ai-sdk') as unknown as AiSdkPlugin | undefined;
  if (!aiSdk?.aiProvider) {
    throw new Error(
      'strapi-plugin-ai-sdk is not installed or failed to initialize; public chat cannot run.',
    );
  }
  return aiSdk.aiProvider;
}

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Prompt in, text out. No tools, no history — the simplest external
   * surface, and the one an integration reaches for when it wants generation
   * rather than a conversation.
   */
  async ask(prompt: string, options?: { system?: string }): Promise<string> {
    const provider = requireProvider(strapi);
    const config = strapi.config.get<PublicChatConfig>('plugin::ai-sdk-public-chat');
    const result = await provider.generateText(prompt, {
      system: options?.system ?? config.systemPrompt,
    });
    return result.text;
  },

  /** Same as `ask`, streamed. */
  async askStream(prompt: string, options?: { system?: string }): Promise<AsyncIterable<string>> {
    const provider = requireProvider(strapi);
    const config = strapi.config.get<PublicChatConfig>('plugin::ai-sdk-public-chat');
    const result = await provider.streamText(prompt, {
      system: options?.system ?? config.systemPrompt,
    });
    return result.textStream;
  },

  async chat(messages: UIMessage[]) {
    const config = strapi.config.get<PublicChatConfig>('plugin::ai-sdk-public-chat');
    const aiSdk = strapi.plugin('ai-sdk') as unknown as AiSdkPlugin | undefined;

    if (!aiSdk?.aiProvider) {
      throw new Error(
        'strapi-plugin-ai-sdk is not installed or failed to initialize; public chat cannot run.',
      );
    }

    // Inherit ai-sdk's model unless overridden, so pointing the host at a local
    // runtime does not leave this plugin calling a model that does not exist.
    const aiSdkConfig = strapi.config.get<Record<string, any>>('plugin::ai-sdk');
    const modelId = config.chatModel ?? aiSdkConfig?.chatModel;
    const maxOutputTokens = config.maxOutputTokens ?? aiSdkConfig?.maxOutputTokens ?? 4096;

    const trimmed = trimMessages(messages, config.maxConversationMessages);
    const modelMessages = await convertToModelMessages(trimmed);

    const tools = createPublicTools(strapi, config.allowedTools, config.allowedContentTypes);

    let system = [PREAMBLE, config.systemPrompt, describeTools(tools)]
      .filter(Boolean)
      .join('\n\n');

    if (config.includePublicMemories) {
      system += await loadPublicMemories(strapi);
    }

    return aiSdk.aiProvider.streamRaw({
      messages: modelMessages,
      system,
      tools,
      maxOutputTokens,
      ...(modelId ? { modelId } : {}),
      stopWhen: stepCountIs(config.maxSteps),
    });
  },
});

/**
 * Public memories still live in ai-sdk's content type. Moving the content type
 * would mean migrating existing rows, which is not worth the coupling saved —
 * this plugin already depends on ai-sdk for the provider and the registry.
 */
async function loadPublicMemories(strapi: Core.Strapi): Promise<string> {
  try {
    const memories = await strapi.documents('plugin::ai-sdk.public-memory' as any).findMany({
      fields: ['content', 'category'],
      sort: { createdAt: 'desc' },
    });
    if (!memories.length) return '';
    const lines = memories.map((m: any) => `- [${m.category}] ${m.content}`);
    return `\n\nPublic knowledge base:\n${lines.join('\n')}`;
  } catch (err) {
    strapi.log.warn('[ai-sdk-public-chat] Failed to load public memories:', err);
    return '';
  }
}

export default service;
