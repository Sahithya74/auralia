import { env } from '../config/env.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider, parseModelList } from './providers/gemini.js';
import { MockProvider } from './providers/mock.js';
import type { AIProvider } from './types.js';

export function createProviderFromEnv(): AIProvider {
  if (env.AI_PROVIDER === 'mock') return new MockProvider();
  if (env.AI_PROVIDER === 'gemini') {
    return new GeminiProvider({
      apiKey: env.GEMINI_API_KEY || undefined,
      models: [
        ...parseModelList(env.GEMINI_MODEL, env.GEMINI_THINKING_LEVEL),
        ...parseModelList(env.GEMINI_FALLBACK_MODELS, env.GEMINI_THINKING_LEVEL),
      ],
      maxTokens: env.AI_MAX_TOKENS,
      timeoutMs: env.AI_TIMEOUT_MS,
      hedgeMs: env.GEMINI_HEDGE_MS,
    });
  }
  return new AnthropicProvider({
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    model: env.ANTHROPIC_MODEL,
    effort: env.AI_EFFORT,
    maxTokens: env.AI_MAX_TOKENS,
    timeoutMs: env.AI_TIMEOUT_MS,
    refusalFallback: env.AI_REFUSAL_FALLBACK,
  });
}

export type { AIProvider } from './types.js';
