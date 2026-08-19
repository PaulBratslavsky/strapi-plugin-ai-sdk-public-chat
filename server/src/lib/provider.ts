import type { Core } from '@strapi/strapi';
import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { PublicChatConfig } from '../config';

/**
 * This plugin resolves its own model rather than borrowing one from
 * strapi-plugin-ai-sdk.
 *
 * Sharing a provider would mean sharing a model choice, and the two surfaces
 * want different ones: admin chat can justify an expensive model for a handful
 * of trusted users, while anonymous traffic is unbounded and usually wants the
 * cheapest model that will do. It also means this plugin installs and runs on
 * its own, with no ordering dependency on another plugin's bootstrap.
 */

type ModelFactory = (modelId: string) => LanguageModel;

function buildFactory(config: PublicChatConfig): ModelFactory {
  const provider = config.provider ?? 'anthropic';
  const apiKey = config.apiKey;

  if (provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey, ...(config.baseURL ? { baseURL: config.baseURL } : {}) });
    return (modelId: string) => anthropic(modelId);
  }

  if (provider === 'openai-compatible') {
    if (!config.baseURL) {
      throw new Error(
        "[ai-sdk-public-chat] provider 'openai-compatible' requires a baseURL " +
          "(e.g. 'http://localhost:11434/v1' for Ollama).",
      );
    }
    const compatible = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: config.baseURL,
      apiKey,
    });
    return (modelId: string) => compatible(modelId);
  }

  throw new Error(
    `[ai-sdk-public-chat] unknown provider '${provider}'. Use 'anthropic' or 'openai-compatible'.`,
  );
}

/**
 * Resolved lazily and cached per config object. Building eagerly at bootstrap
 * would make a missing API key a boot failure for the whole app, when it should
 * only fail the requests that actually need a model.
 */
const cache = new WeakMap<object, ModelFactory>();

export function resolveModel(strapi: Core.Strapi, modelId: string): LanguageModel {
  const config = strapi.config.get<PublicChatConfig>('plugin::ai-sdk-public-chat');

  let factory = cache.get(config as unknown as object);
  if (!factory) {
    factory = buildFactory(config);
    cache.set(config as unknown as object, factory);
  }

  return factory(modelId);
}
