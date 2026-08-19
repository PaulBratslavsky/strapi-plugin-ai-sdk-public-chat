export interface PublicChatConfig {
  /** 'anthropic' or 'openai-compatible'. */
  provider?: string;
  /** API key for the provider. Not required by every local runtime. */
  apiKey?: string;
  /** Base URL. Required for 'openai-compatible' (e.g. Ollama's /v1). */
  baseURL?: string;
  /**
   * Content type UIDs the content tools may query, e.g. ['api::article.article'].
   * Empty means none, which makes `searchContent` useless rather than
   * unrestricted — deliberately the safe direction.
   */
  allowedContentTypes: string[];
  /** Model id. */
  chatModel?: string;
  /** Extra instructions appended to the system prompt. */
  systemPrompt?: string;
  /** Max messages kept from conversation history. */
  maxConversationMessages: number;
  /** Max tool-call steps per response. */
  maxSteps: number;
  /** Max output tokens. */
  maxOutputTokens?: number;
  /**
   * Content type UID to read background documents from, injected into the
   * system prompt. Unset by default so this plugin requires no particular
   * content type to exist. Point it at `plugin::ai-sdk.public-memory` to reuse
   * data created by strapi-plugin-ai-sdk.
   */
  publicMemoryContentType?: string;
  /**
   * Prompt-injection screening for the anonymous routes.
   *
   * This module lives here rather than in strapi-plugin-ai-sdk because every
   * route in this plugin is anonymous — no session, no token, no role beyond
   * Public. That is the surface screening exists for. ai-sdk serves only
   * logged-in admins, where it would amount to protecting a trusted user from
   * themselves.
   */
  guardrails?: {
    enabled?: boolean;
    maxInputLength?: number;
    additionalPatterns?: string[];
    disableDefaultPatterns?: boolean;
    blockedMessage?: string;
  };
}

export default {
  default: {
    provider: 'anthropic',
    apiKey: undefined as string | undefined,
    baseURL: undefined as string | undefined,
    allowedContentTypes: [] as string[],
    chatModel: 'claude-haiku-4-5-20251001',
    systemPrompt: undefined as string | undefined,
    maxConversationMessages: 10,
    maxSteps: 2,
    maxOutputTokens: undefined as number | undefined,
    publicMemoryContentType: undefined as string | undefined,
    guardrails: {
      enabled: true,
      maxInputLength: 10000,
    },
  },
  validator(config: Partial<PublicChatConfig>) {
    if (config.allowedContentTypes !== undefined && !Array.isArray(config.allowedContentTypes)) {
      throw new Error('[ai-sdk-public-chat] allowedContentTypes must be an array of content type UIDs');
    }
    if (config.maxSteps !== undefined && (typeof config.maxSteps !== 'number' || config.maxSteps < 1)) {
      throw new Error('[ai-sdk-public-chat] maxSteps must be a positive number');
    }
  },
};
