import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { AIProviderError, type AIProvider, type GenerateRequest } from '../types.js';

export interface GeminiProviderOptions {
  apiKey?: string;
  model: string;
  /** Tried in turn when the main model is overloaded, before any text has been sent. */
  fallbackModels?: string[];
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs: number;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [700, 1500];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AIProviderError('aborted', 'Request cancelled.'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AIProviderError('aborted', 'Request cancelled.'));
      },
      { once: true },
    );
  });
}

const THINKING: Record<GeminiProviderOptions['thinkingLevel'], ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const BLOCKED: ReadonlySet<string> = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

function toProviderError(err: unknown, signal?: AbortSignal): AIProviderError {
  if (err instanceof AIProviderError) return err;
  if (signal?.aborted) return new AIProviderError('aborted', 'Request cancelled.');
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return new AIProviderError('auth', 'Gemini rejected the configured API key.', err.status);
    if (err.status === 429) return new AIProviderError('rate_limit', 'Gemini is rate-limiting requests.', 429);
    if (err.status >= 500) return new AIProviderError('overloaded', 'Gemini is temporarily unavailable.', err.status);
    // An invalid key is reported as 400 by the Gemini API.
    if (err.status === 400 && /api key/i.test(err.message)) return new AIProviderError('auth', 'Gemini rejected the configured API key.', 400);
    return new AIProviderError('bad_request', 'Gemini rejected the request.', err.status);
  }
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return new AIProviderError('timeout', 'Gemini took too long to respond.');
  }
  if (err instanceof TypeError) return new AIProviderError('network', 'Could not reach Gemini.');
  return new AIProviderError('unknown', 'Unexpected Gemini error.');
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly isMock = false;
  readonly model: string;
  private readonly client: GoogleGenAI | null;

  constructor(private readonly options: GeminiProviderOptions) {
    this.model = options.model;
    this.client = options.apiKey
      ? new GoogleGenAI({ apiKey: options.apiKey, httpOptions: { timeout: options.timeoutMs } })
      : null;
  }

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    const models = [this.model, ...(this.options.fallbackModels ?? [])];
    for (let attempt = 0; ; attempt++) {
      let sentText = false;
      try {
        for await (const text of this.streamOnce(models[attempt % models.length]!, request)) {
          sentText = true;
          yield text;
        }
        return;
      } catch (err) {
        const error = toProviderError(err, request.signal);
        // Retrying after text was sent would repeat part of the reply.
        const retry = !sentText && attempt < MAX_ATTEMPTS - 1 && (error.kind === 'overloaded' || error.kind === 'rate_limit');
        if (!retry) throw error;
        await sleep(BACKOFF_MS[attempt] ?? 1500, request.signal);
      }
    }
  }

  private async *streamOnce(model: string, request: GenerateRequest): AsyncIterable<string> {
    if (!this.client) throw new AIProviderError('not_configured', 'GEMINI_API_KEY is not set.');
    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents: request.turns.map((t) => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }],
        })),
        config: {
          systemInstruction: request.system,
          maxOutputTokens: request.maxTokens ?? this.options.maxTokens,
          abortSignal: request.signal,
          thinkingConfig: { thinkingLevel: THINKING[this.options.thinkingLevel] },
        },
      });

      let finishReason: string | undefined;
      for await (const chunk of stream) {
        if (chunk.promptFeedback?.blockReason) {
          throw new AIProviderError('refusal', 'Gemini declined to answer this message.');
        }
        const text = chunk.text;
        if (text) yield text;
        finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
      }
      if (finishReason && BLOCKED.has(finishReason)) {
        throw new AIProviderError('refusal', 'Gemini stopped this reply.');
      }
    } catch (err) {
      throw toProviderError(err, request.signal);
    }
  }

  async complete(request: GenerateRequest): Promise<string> {
    let text = '';
    for await (const chunk of this.stream(request)) text += chunk;
    return text;
  }
}
