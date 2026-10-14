import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { AIProviderError, type AIProvider, type GenerateRequest } from '../types.js';

export type GeminiThinking = 'minimal' | 'low' | 'medium' | 'high';

export interface GeminiModelChoice {
  model: string;
  thinking: GeminiThinking;
}

export interface GeminiProviderOptions {
  apiKey?: string;
  /** Tried in order; later entries are backups (see hedgeMs). */
  models: GeminiModelChoice[];
  maxTokens: number;
  timeoutMs: number;
  /**
   * If no text has arrived after this long, a backup model is started in
   * parallel and whichever answers first is used. Keeps replies quick when one
   * model is overloaded.
   */
  hedgeMs: number;
  maxAttempts?: number;
}

const THINKING: Record<GeminiThinking, ThinkingLevel> = {
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

/** Parses "model[:thinking],model[:thinking]" from configuration. */
export function parseModelList(spec: string, defaultThinking: GeminiThinking): GeminiModelChoice[] {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [model, thinking] = entry.split(':');
      const level = (thinking?.trim() as GeminiThinking | undefined) ?? defaultThinking;
      return { model: model!.trim(), thinking: level in THINKING ? level : defaultThinking };
    });
}

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

interface Attempt {
  controller: AbortController;
  iterator: AsyncIterator<string>;
  first: Promise<{ attempt: Attempt; result: IteratorResult<string> }>;
  release(): void;
}

type RaceOutcome =
  | { kind: 'chunk'; attempt: Attempt; result: IteratorResult<string> }
  | { kind: 'error'; attempt: Attempt; error: unknown }
  | { kind: 'hedge' };

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly isMock = false;
  readonly model: string;
  private readonly client: GoogleGenAI | null;

  constructor(private readonly options: GeminiProviderOptions) {
    if (options.models.length === 0) throw new Error('GeminiProvider needs at least one model');
    this.model = options.models[0]!.model;
    this.client = options.apiKey
      ? new GoogleGenAI({ apiKey: options.apiKey, httpOptions: { timeout: options.timeoutMs } })
      : null;
  }

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    if (!this.client) throw new AIProviderError('not_configured', 'GEMINI_API_KEY is not set.');
    const { models, hedgeMs } = this.options;
    const maxAttempts = this.options.maxAttempts ?? 3;

    const launch = (index: number): Attempt => {
      const choice = models[index % models.length]!;
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      request.signal?.addEventListener('abort', forwardAbort, { once: true });
      const iterator = this.streamOnce(choice, { ...request, signal: controller.signal })[Symbol.asyncIterator]();
      const attempt = {
        controller,
        iterator,
        release: () => request.signal?.removeEventListener('abort', forwardAbort),
      } as Attempt;
      attempt.first = iterator.next().then(
        (result) => ({ attempt, result }),
        (error: unknown) => Promise.reject({ attempt, error }),
      );
      return attempt;
    };

    let pending: Attempt[] = [launch(0)];
    let launched = 1;
    let lastError: AIProviderError | null = null;
    let winner: Attempt | null = null;
    let firstResult: IteratorResult<string> | null = null;

    while (!winner) {
      let hedgeTimer: NodeJS.Timeout | undefined;
      const hedge =
        launched < maxAttempts
          ? new Promise<RaceOutcome>((resolve) => {
              hedgeTimer = setTimeout(() => resolve({ kind: 'hedge' }), hedgeMs);
            })
          : new Promise<RaceOutcome>(() => undefined);
      const outcome = await Promise.race<RaceOutcome>([
        ...pending.map((a) =>
          a.first.then(
            (r): RaceOutcome => ({ kind: 'chunk', ...r }),
            (e: { attempt: Attempt; error: unknown }): RaceOutcome => ({ kind: 'error', ...e }),
          ),
        ),
        hedge,
      ]);
      clearTimeout(hedgeTimer);

      if (outcome.kind === 'hedge') {
        pending.push(launch(launched++));
        continue;
      }
      if (outcome.kind === 'error') {
        outcome.attempt.release();
        pending = pending.filter((a) => a !== outcome.attempt);
        const error = toProviderError(outcome.error, request.signal);
        if (error.kind === 'aborted' && request.signal?.aborted) throw error;
        lastError = error;
        // Credentials or a refused request won't succeed on another model.
        if (error.kind === 'auth' || error.kind === 'not_configured' || error.kind === 'refusal') {
          pending.forEach((a) => a.controller.abort());
          throw error;
        }
        if (pending.length === 0) {
          if (launched >= maxAttempts) throw lastError;
          pending.push(launch(launched++));
        }
        continue;
      }
      winner = outcome.attempt;
      firstResult = outcome.result;
    }

    for (const other of pending) {
      if (other !== winner) {
        other.controller.abort();
        other.release();
        // The loser's rejection is expected; keep it from surfacing as unhandled.
        other.first.catch(() => undefined);
      }
    }

    try {
      if (firstResult && !firstResult.done) yield firstResult.value;
      for (;;) {
        const next = await winner.iterator.next();
        if (next.done) break;
        yield next.value;
      }
    } catch (err) {
      throw toProviderError(err, request.signal);
    } finally {
      winner.release();
    }
  }

  private async *streamOnce(choice: GeminiModelChoice, request: GenerateRequest): AsyncIterable<string> {
    try {
      const stream = await this.client!.models.generateContentStream({
        model: choice.model,
        contents: request.turns.map((t) => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }],
        })),
        config: {
          systemInstruction: request.system,
          maxOutputTokens: request.maxTokens ?? this.options.maxTokens,
          abortSignal: request.signal,
          thinkingConfig: { thinkingLevel: THINKING[choice.thinking] },
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
