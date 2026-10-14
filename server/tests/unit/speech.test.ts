import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  cleanSpeechText,
  GeminiSpeech,
  retryDelayMs,
  SpeechUnavailableError,
  type SpeechRequest,
} from '../../src/ai/speech/geminiSpeech.js';

type Script = (signal: AbortSignal) => AsyncIterable<Buffer>;

const audio = (n: number) => Buffer.alloc(n, 1);
const quotaError = (seconds: number) =>
  new ApiError({ message: `{"error":{"code":429,"details":[{"retryDelay": "${seconds}s"}]}}`, status: 429 });

function speechWith(scripts: Record<string, Script>, clock = { now: 0 }, firstAudioTimeoutMs = 200) {
  const started: string[] = [];
  const speech = new GeminiSpeech(
    { apiKey: 'test-key', models: Object.keys(scripts), voice: 'Sulafat', firstAudioTimeoutMs, now: () => clock.now },
    async (model, _request, signal) => {
      started.push(model);
      return scripts[model]!(signal);
    },
  );
  return { speech, started, clock };
}

const request: SpeechRequest = { text: 'I am here with you.' };

async function collect(chunks: AsyncIterable<Buffer>) {
  let bytes = 0;
  for await (const c of chunks) bytes += c.length;
  return bytes;
}

describe('GeminiSpeech', () => {
  it('streams audio from the first model that answers', async () => {
    const { speech, started } = speechWith({
      a: async function* () {
        yield audio(4);
        yield audio(6);
      },
      b: async function* () {
        yield audio(1);
      },
    });
    const stream = await speech.stream(request);
    expect(stream.model).toBe('a');
    expect(await collect(stream.chunks)).toBe(10);
    expect(started).toEqual(['a']);
  });

  it('rests a model that hit its quota for as long as Google asks, using the next one meanwhile', async () => {
    let calls = 0;
    const { speech, started, clock } = speechWith({
      a: async function* () {
        calls++;
        if (calls === 1) throw quotaError(30);
        yield audio(2);
      },
      b: async function* () {
        yield audio(2);
      },
    });
    expect((await speech.stream(request)).model).toBe('b');
    expect((await speech.stream(request)).model).toBe('b');
    expect(started).toEqual(['a', 'b', 'b']);
    clock.now += 31_000;
    expect((await speech.stream(request)).model).toBe('a');
  });

  it('moves on when a model produces no audio in time', async () => {
    const { speech } = speechWith({
      slow: async function* (signal) {
        await new Promise((resolve) => signal.addEventListener('abort', resolve));
        yield audio(2);
      },
      quick: async function* () {
        yield audio(2);
      },
    });
    expect((await speech.stream(request)).model).toBe('quick');
  });

  it('reports that no voice is available when every model fails, and when the key is rejected', async () => {
    const { speech } = speechWith({
      a: async function* () {
        throw quotaError(60);
      },
      b: async function* () {
        // eslint-disable-next-line no-constant-condition
        if (true) throw new ApiError({ message: 'overloaded', status: 503 });
        yield audio(1);
      },
    });
    await expect(speech.stream(request)).rejects.toBeInstanceOf(SpeechUnavailableError);
    expect(speech.available).toBe(false);

    const rejected = speechWith({
      a: async function* () {
        throw new ApiError({ message: 'bad key', status: 403 });
      },
      b: async function* () {
        yield audio(1);
      },
    });
    await expect(rejected.speech.stream(request)).rejects.toThrow('rejected');
    expect(rejected.started).toEqual(['a']);
  });
});

describe('speech helpers', () => {
  it('reads the retry delay from a quota error, and rests for an hour on a daily quota', () => {
    expect(retryDelayMs('"retryDelay": "59s"')).toBe(59_000);
    expect(retryDelayMs('\\"retryDelay\\": \\"12.5s\\"')).toBe(12_500);
    expect(retryDelayMs('GenerateRequestsPerDayPerProjectPerModel')).toBe(3_600_000);
    expect(retryDelayMs('no hint')).toBeNull();
  });

  it('removes formatting and mock labels before speaking', () => {
    expect(cleanSpeechText('[Development mock reply] **Take** a breath.\n\nI am here.')).toBe('Take a breath. I am here.');
  });
});
