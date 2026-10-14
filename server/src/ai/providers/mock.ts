import { AIProviderError, type AIProvider, type GenerateRequest } from '../types.js';

export const MOCK_LABEL = '[Development mock - not a real AI reply]';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
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

/**
 * Development-only provider used when no AI key is configured and in tests.
 * Every reply is prefixed with MOCK_LABEL and the client shows a "mock mode"
 * banner, so mock output is never presented as a real conversation.
 *
 * Test triggers in the last user message: "__mock_fail__" (provider error),
 * "__mock_slow__" (slow stream, for cancellation tests).
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'mock';
  readonly isMock = true;

  constructor(private readonly chunkDelayMs = 15) {}

  async *stream(request: GenerateRequest): AsyncIterable<string> {
    const last = [...request.turns].reverse().find((t) => t.role === 'user')?.content ?? '';
    if (last.includes('__mock_fail__')) {
      throw new AIProviderError('overloaded', 'Mock provider failure (test trigger).', 529);
    }
    const slow = last.includes('__mock_slow__');
    const lang = /Reply in ([A-Za-z]+)/.exec(request.system)?.[1] ?? 'English';
    const quoted = Array.from(last).slice(0, 80).join('');
    const reply =
      `${MOCK_LABEL} (${lang}) I received: "${quoted}". ` +
      'Set AI_PROVIDER=anthropic with an API key in server/.env to talk with the real model.';

    for (const word of reply.split(/(?<= )/)) {
      await sleep(slow ? 250 : this.chunkDelayMs, request.signal);
      yield word;
    }
  }

  async complete(request: GenerateRequest): Promise<string> {
    let text = '';
    for await (const chunk of this.stream(request)) text += chunk;
    return text;
  }
}
