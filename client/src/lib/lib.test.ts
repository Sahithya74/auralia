import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { toContext, type UiMessage } from '../hooks/useConversation';
import { createSseParser } from './api/sse';
import { LANGUAGE_CODES } from './i18n/languages';
import { detectVoiceSupport, pickVoice } from './voice/capabilities';
import { startRecognition } from './voice/recognition';
import { cleanForSpeech, splitSentences } from './voice/speechPlayer';

describe('SSE parser', () => {
  it('handles events split across chunks, comments and multiple events per chunk', () => {
    const events: { event: string; data: string }[] = [];
    const parser = createSseParser((m) => events.push(m));
    parser.push('event: meta\ndata: {"a"');
    parser.push(':1}\n\n: keep-alive\n\nevent: delta\r\ndata: {"text":"வணக்கம்"}\r\n\r\nevent: done\ndata: {}\n');
    expect(events).toEqual([
      { event: 'meta', data: '{"a":1}' },
      { event: 'delta', data: '{"text":"வணக்கம்"}' },
    ]);
    parser.push('\n');
    expect(events.at(-1)).toEqual({ event: 'done', data: '{}' });
  });
});

describe('speech helpers', () => {
  it('splits complete sentences in Latin and Devanagari text, keeping the remainder', () => {
    expect(splitSentences('Hello there. How are you? I am')).toEqual({ complete: ['Hello there.', 'How are you?'], rest: 'I am' });
    expect(splitSentences('आप कैसी हैं। मैं यहाँ हूँ। और')).toEqual({ complete: ['आप कैसी हैं।', 'मैं यहाँ हूँ।'], rest: 'और' });
  });

  it('removes markdown symbols and the mock label before speaking', () => {
    expect(cleanForSpeech('[Development mock - not a real AI reply] **Hi** _there_')).toBe('Hi there');
  });
});

describe('voice capability detection', () => {
  const voice = (lang: string, localService = true) => ({ lang, localService, name: lang }) as SpeechSynthesisVoice;

  it('prefers an exact local voice, then any exact match, then the base language', () => {
    expect(pickVoice([voice('ta-IN', false), voice('ta-IN')], 'ta-IN')).toEqual(voice('ta-IN'));
    expect(pickVoice([voice('hi_IN', false)], 'hi-IN')?.lang).toBe('hi_IN');
    expect(pickVoice([voice('en-GB')], 'en-IN')?.lang).toBe('en-GB');
    expect(pickVoice([voice('en-US')], 'ml-IN')).toBeNull();
  });

  it('reports missing APIs instead of failing silently', async () => {
    expect(await detectVoiceSupport('ta-IN')).toEqual({ recognition: 'no-api', synthesis: 'no-api', voice: null });
    const onError = vi.fn();
    const onEnd = vi.fn();
    expect(startRecognition('ta-IN', { onInterim: vi.fn(), onFinal: vi.fn(), onError, onEnd })).toBeNull();
    expect(onError).toHaveBeenCalledWith('unavailable');
  });
});

describe('conversation context', () => {
  it('sends user turns and completed replies only', () => {
    const messages: UiMessage[] = [
      { id: '1', role: 'user', content: 'hi', status: 'done' },
      { id: '2', role: 'assistant', content: 'hello', status: 'done' },
      { id: '3', role: 'user', content: 'again', status: 'done' },
      { id: '4', role: 'assistant', content: 'half a rep', status: 'error' },
      { id: '5', role: 'assistant', content: '', status: 'stopped' },
    ];
    expect(toContext(messages)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'again' },
    ]);
  });
});

describe('translations', () => {
  const dir = path.resolve(import.meta.dirname, 'i18n/locales');
  const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, string> =>
    Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') Object.assign(acc, flatten(v as Record<string, unknown>, key));
      else acc[key] = String(v);
      return acc;
    }, {});
  const load = (code: string) => flatten(JSON.parse(readFileSync(path.join(dir, `${code}.json`), 'utf8')));
  const en = load('en');

  it('has a locale file for every supported language and nothing else', () => {
    const files = readdirSync(dir).map((f) => f.replace('.json', '')).sort();
    expect(files).toEqual([...LANGUAGE_CODES].sort());
  });

  it.each(LANGUAGE_CODES.filter((c) => c !== 'en'))('%s has every English key, no extras, and no empty strings', (code) => {
    const other = load(code);
    expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(other)) expect(value.trim(), key).not.toBe('');
  });

  it.each(LANGUAGE_CODES.filter((c) => c !== 'en'))('%s keeps every {{placeholder}}', (code) => {
    const other = load(code);
    for (const [key, value] of Object.entries(en)) {
      const placeholders = value.match(/\{\{\w+\}\}/g) ?? [];
      for (const p of placeholders) expect(other[key], `${code}:${key}`).toContain(p);
    }
  });
});
