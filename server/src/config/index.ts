export interface PublicChatConfig {
  /**
   * Tool names this plugin may use, by their name in ai-sdk's registry
   * (e.g. 'searchContent', 'ai_sdk_yt_transcripts__search_transcript').
   *
   * Defaults to `[]` — no tools at all. This is the whole point of the
   * plugin: anonymous traffic gets nothing unless it is named here, so a
   * tool added to ai-sdk later can never appear on the public surface by
   * default the way it did when public chat shared ai-sdk's registry.
   */
  allowedTools: string[];
  /**
   * Content type UIDs the content tools may query, e.g. ['api::article.article'].
   * Empty means none, which makes `searchContent` useless rather than
   * unrestricted — deliberately the safe direction.
   */
  allowedContentTypes: string[];
  /** Model id. Omit to inherit ai-sdk's configured chatModel. */
  chatModel?: string;
  /** Extra instructions appended to the system prompt. */
  systemPrompt?: string;
  /** Max messages kept from conversation history. */
  maxConversationMessages: number;
  /** Max tool-call steps per response. */
  maxSteps: number;
  /** Max output tokens. Omit to inherit ai-sdk's setting. */
  maxOutputTokens?: number;
  /** Include public-memory documents in the system prompt. */
  includePublicMemories: boolean;
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
    allowedTools: [] as string[],
    allowedContentTypes: [] as string[],
    chatModel: undefined as string | undefined,
    systemPrompt: undefined as string | undefined,
    maxConversationMessages: 10,
    maxSteps: 2,
    maxOutputTokens: undefined as number | undefined,
    includePublicMemories: true,
    guardrails: {
      enabled: true,
      maxInputLength: 10000,
    },
  },
  validator(config: Partial<PublicChatConfig>) {
    if (config.allowedTools !== undefined && !Array.isArray(config.allowedTools)) {
      throw new Error('[ai-sdk-public-chat] allowedTools must be an array of tool names');
    }
    if (config.allowedContentTypes !== undefined && !Array.isArray(config.allowedContentTypes)) {
      throw new Error('[ai-sdk-public-chat] allowedContentTypes must be an array of content type UIDs');
    }
    if (config.maxSteps !== undefined && (typeof config.maxSteps !== 'number' || config.maxSteps < 1)) {
      throw new Error('[ai-sdk-public-chat] maxSteps must be a positive number');
    }
  },
};
