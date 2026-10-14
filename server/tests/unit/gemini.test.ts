import { describe, expect, it } from 'vitest';
import { GeminiProvider, parseModelList, type GeminiModelChoice } from '../../src/ai/providers/gemini.js';
import { AIProviderError, type GenerateRequest } from '../../src/ai/types.js';

type Script = (signal: AbortSignal) => AsyncIterable<string>;

/** A provider whose network calls are replaced by scripted streams per model. */
function providerWith(scripts: Record<string, Script>, hedgeMs = 40) {
  const provider = new GeminiProvider({
    apiKey: 'test-key',
    models: Object.keys(scripts).map((model) => ({ model, thinking: 'minimal' as const })),
    maxTokens: 100,
    timeoutMs: 5000,
    hedgeMs,
  });
  const started: string[] = [];
  const aborted: string[] = [];
  (provider as unknown as { streamOnce: (c: GeminiModelChoice, r: GenerateRequest) => AsyncIterable<string> }).streamOnce = (
    choice,
    request,
  ) => {
    started.push(choice.model);
    request.signal?.addEventListener('abort', () => aborted.push(choice.model));
    return scripts[choice.model]!(request.signal!);
  };
  return { provider, started, aborted };
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new AIProviderError('aborted', 'aborted'));
    });
  });

const request: GenerateRequest = { system: 's', turns: [{ role: 'user', content: 'hi' }] };

describe('parseModelList', () => {
  it('reads models with optional per-model thinking levels', () => {
    expect(parseModelList('gemini-a, gemini-b:low ,,gemini-c:bogus', 'minimal')).toEqual([
      { model: 'gemini-a', thinking: 'minimal' },
      { model: 'gemini-b', thinking: 'low' },
      { model: 'gemini-c', thinking: 'minimal' },
    ]);
  });
});

describe('GeminiProvider racing', () => {
  it('uses the main model when it answers quickly', async () => {
    const { provider, started } = providerWith({
      fast: async function* () {
        yield 'hello ';
        yield 'there';
      },
      backup: async function* () {
        yield 'unused';
      },
    });
    expect(await provider.complete(request)).toBe('hello there');
    expect(started).toEqual(['fast']);
  });

  it('starts a backup when the main model is slow, uses whichever answers first and cancels the other', async () => {
    const { provider, started, aborted } = providerWith({
      slow: async function* (signal) {
        await wait(2000, signal);
        yield 'too late';
      },
      backup: async function* () {
        yield 'quick reply';
      },
    });
    expect(await provider.complete(request)).toBe('quick reply');
    expect(started).toEqual(['slow', 'backup']);
    expect(aborted).toContain('slow');
  });

  it('moves straight to the next model when one is overloaded', async () => {
    const { provider, started } = providerWith(
      {
        busy: async function* () {
          throw new AIProviderError('overloaded', '503', 503);
        },
        backup: async function* () {
          yield 'ok';
        },
      },
      10_000,
    );
    expect(await provider.complete(request)).toBe('ok');
    expect(started).toEqual(['busy', 'backup']);
  });

  it('does not retry a rejected key', async () => {
    const { provider, started } = providerWith({
      a: async function* () {
        throw new AIProviderError('auth', 'bad key', 403);
      },
      b: async function* () {
        yield 'never';
      },
    });
    await expect(provider.complete(request)).rejects.toMatchObject({ kind: 'auth' });
    expect(started).toEqual(['a']);
  });

  it('reports the failure when every attempt fails', async () => {
    const { provider, started } = providerWith({
      a: async function* () {
        throw new AIProviderError('overloaded', '503', 503);
      },
      b: async function* () {
        throw new AIProviderError('rate_limit', '429', 429);
      },
    });
    await expect(provider.complete(request)).rejects.toMatchObject({ retryable: true });
    expect(started).toHaveLength(3);
  });
});
