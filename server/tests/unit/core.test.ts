import { describe, expect, it } from 'vitest';
import { MockProvider, MOCK_LABEL } from '../../src/ai/providers/mock.js';
import { AIProviderError } from '../../src/ai/types.js';
import { chatSchema, clientErrorCode, contextTurns, MAX_CONTEXT_TURNS } from '../../src/modules/chat/chat.service.js';
import { parseMemorySuggestions } from '../../src/modules/chat/chat.routes.js';
import { titleFrom } from '../../src/persistence/memoryGate.js';
import { resolvePolicy } from '../../src/persistence/policy.js';
import { redact } from '../../src/utils/logger.js';

describe('resolvePolicy', () => {
  it.each([
    ['NONE', false, false, false],
    ['NONE', true, false, false],
    ['SESSION', false, false, false],
    ['SESSION', true, false, false],
    ['PERSONAL', false, false, true],
    ['PERSONAL', true, true, true],
  ] as const)('%s with history=%s -> transcripts=%s memories=%s', (mode, history, transcripts, memories) => {
    expect(resolvePolicy(mode, history)).toEqual({ mode, transcripts, memories });
  });
});

describe('logger redaction', () => {
  it('removes content, credentials and contact details at any depth', () => {
    expect(
      redact({ userId: 'u1', content: 'secret', nested: { password: 'x', email: 'a@b.c', ok: 1 }, list: [{ token: 't' }] }),
    ).toEqual({ userId: 'u1', content: '[redacted]', nested: { password: '[redacted]', email: '[redacted]', ok: 1 }, list: [{ token: '[redacted]' }] });
  });
});

describe('contextTurns', () => {
  it('keeps only recent turns and always starts with the user', () => {
    const turns = Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `t${i}`,
    }));
    turns.push({ role: 'user', content: 'last' });
    const ctx = contextTurns(turns);
    expect(ctx.length).toBeLessThanOrEqual(MAX_CONTEXT_TURNS);
    expect(ctx[0]!.role).toBe('user');
    expect(ctx.at(-1)!.content).toBe('last');
  });
});

describe('chatSchema', () => {
  const valid = {
    requestId: '0b8f5d1e-4f43-4d0a-9a3e-2d7f8a9b1c2d',
    language: 'ta',
    messages: [{ role: 'user', content: 'வணக்கம்' }],
  };
  it('accepts a valid request', () => {
    expect(chatSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects unsupported languages, unknown fields, and a trailing assistant turn', () => {
    expect(chatSchema.safeParse({ ...valid, language: 'fr' }).success).toBe(false);
    expect(chatSchema.safeParse({ ...valid, persist: true }).success).toBe(false);
    expect(chatSchema.safeParse({ ...valid, messages: [...valid.messages, { role: 'assistant', content: 'hi' }] }).success).toBe(false);
  });
  it('rejects a user message over 4000 characters', () => {
    expect(chatSchema.safeParse({ ...valid, messages: [{ role: 'user', content: 'a'.repeat(4001) }] }).success).toBe(false);
  });
});

describe('MockProvider', () => {
  it('labels every reply as a mock', async () => {
    const reply = await new MockProvider(0).complete({ system: 'Reply in Tamil', turns: [{ role: 'user', content: 'hello' }] });
    expect(reply.startsWith(MOCK_LABEL)).toBe(true);
    expect(reply).toContain('(Tamil)');
  });
  it('can simulate a provider failure', async () => {
    await expect(
      new MockProvider(0).complete({ system: '', turns: [{ role: 'user', content: '__mock_fail__' }] }),
    ).rejects.toMatchObject({ kind: 'overloaded', retryable: true });
  });
  it('stops when aborted', async () => {
    const controller = new AbortController();
    const stream = new MockProvider(0).stream({
      system: '',
      turns: [{ role: 'user', content: '__mock_slow__' }],
      signal: controller.signal,
    });
    const chunks: string[] = [];
    await expect(
      (async () => {
        for await (const c of stream) {
          chunks.push(c);
          controller.abort();
        }
      })(),
    ).rejects.toMatchObject({ kind: 'aborted' });
    expect(chunks).toHaveLength(1);
  });
});

describe('clientErrorCode', () => {
  it('maps provider failures to stable client codes', () => {
    expect(clientErrorCode(new AIProviderError('rate_limit', ''))).toBe('AI_BUSY');
    expect(clientErrorCode(new AIProviderError('auth', ''))).toBe('AI_UNAVAILABLE');
    expect(clientErrorCode(new AIProviderError('refusal', ''))).toBe('AI_REFUSAL');
    expect(clientErrorCode(new AIProviderError('timeout', ''))).toBe('AI_TIMEOUT');
  });
});

describe('parseMemorySuggestions', () => {
  it('extracts a JSON array even with surrounding text and repairs bad fields', () => {
    const out = parseMemorySuggestions(
      'Here you go: [{"content":"You prefer evenings","category":"ROUTINE","kind":"STATED","sensitive":false},{"content":"x","category":"WEIRD","kind":"?","sensitive":"no"}]',
    );
    expect(out).toEqual([
      { content: 'You prefer evenings', category: 'ROUTINE', kind: 'STATED', sensitive: false },
      { content: 'x', category: 'OTHER', kind: 'INTERPRETATION', sensitive: true },
    ]);
  });
  it('returns [] for invalid output', () => {
    expect(parseMemorySuggestions('no json here')).toEqual([]);
    expect(parseMemorySuggestions('[not json]')).toEqual([]);
  });
});

describe('titleFrom', () => {
  it('shortens long first messages without splitting characters', () => {
    expect(titleFrom('a'.repeat(100))).toHaveLength(60);
    expect(titleFrom('  hello \n world ')).toBe('hello world');
    expect(Array.from(titleFrom('த'.repeat(80)))).toHaveLength(60);
  });
});
