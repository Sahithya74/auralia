import { env } from '../config/env.js';
import { GeminiSpeech } from './speech/geminiSpeech.js';
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

/** Natural voice for spoken replies, or null when it is turned off or has no key. */
export function createSpeechFromEnv(): GeminiSpeech | null {
  if (!env.NATURAL_VOICE || !env.GEMINI_API_KEY || env.AI_PROVIDER === 'mock') return null;
  return new GeminiSpeech({
    apiKey: env.GEMINI_API_KEY,
    models: env.GEMINI_TTS_MODELS.split(',').map((m) => m.trim()).filter(Boolean),
    voices: { FEMALE: env.GEMINI_TTS_VOICE, MALE: env.GEMINI_TTS_MALE_VOICE },
    firstAudioTimeoutMs: env.GEMINI_TTS_FIRST_AUDIO_MS,
  });
}

export type { AIProvider } from './types.js';
