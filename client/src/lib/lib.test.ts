import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toContext, type UiMessage } from '../hooks/useConversation';
import { createSseParser } from './api/sse';
import { LANGUAGE_CODES } from './i18n/languages';
import { detectVoiceSupport, pickVoice } from './voice/capabilities';
import { pcm16ToFloat32, playNaturalVoice } from './voice/naturalVoice';
import { startRecognition } from './voice/recognition';
import { cleanForSpeech, SpeechPlayer, splitSentences } from './voice/speechPlayer';

vi.mock('./voice/naturalVoice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./voice/naturalVoice')>()),
  playNaturalVoice: vi.fn(),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

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

  it('prefers natural-sounding and female voices for the language', () => {
    const named = (name: string, lang = 'en-IN', localService = true) => ({ lang, localService, name }) as SpeechSynthesisVoice;
    const voices = [
      named('Microsoft Ravi - English (India)'),
      named('Microsoft Heera - English (India)'),
      named('Microsoft Neerja Online (Natural) - English (India)', 'en-IN', false),
      named('Google UK English Male', 'en-GB', false),
    ];
    expect(pickVoice(voices, 'en-IN')?.name).toBe('Microsoft Neerja Online (Natural) - English (India)');
    expect(pickVoice(voices.slice(0, 2), 'en-IN')?.name).toBe('Microsoft Heera - English (India)');
  });

  it('reports missing APIs instead of failing silently', async () => {
    expect(await detectVoiceSupport('ta-IN')).toEqual({ recognition: 'no-api', synthesis: 'no-api', voice: null });
    const onError = vi.fn();
    const onEnd = vi.fn();
    expect(startRecognition('ta-IN', { onInterim: vi.fn(), onFinal: vi.fn(), onError, onEnd })).toBeNull();
    expect(onError).toHaveBeenCalledWith('unavailable');
  });
});

describe('natural voice', () => {
  it('turns streamed 16-bit PCM into samples, carrying a split sample to the next chunk', () => {
    const first = pcm16ToFloat32(new Uint8Array([0x00, 0x40, 0x00]), null);
    expect(Array.from(first.samples)).toEqual([0.5]);
    expect(first.carry).toBe(0x00);
    const second = pcm16ToFloat32(new Uint8Array([0xc0]), first.carry);
    expect(Array.from(second.samples)).toEqual([-0.5]);
    expect(second.carry).toBeNull();
  });
});

describe('SpeechPlayer with the natural voice', () => {
  const play = vi.mocked(playNaturalVoice);
  const options = { lang: 'ta-IN', rate: 1, voice: null, natural: { language: 'ta', deviceFallback: false } };
  afterEach(() => play.mockReset());

  function playback(ok: boolean) {
    let finish!: () => void;
    const finished = new Promise<void>((r) => (finish = r));
    const stop = vi.fn(() => finish());
    play.mockReturnValue({ started: Promise.resolve(ok), finished, stop });
    return { finish, stop };
  }

  it('speaks the whole reply once it is complete: preparing, then speaking, then done', async () => {
    const { finish } = playback(true);
    const events = { onSpeakingChange: vi.fn(), onPreparingChange: vi.fn() };
    const player = new SpeechPlayer(events);
    player.beginStream(options);
    player.pushStream('வணக்கம். ');
    player.pushStream('நான் இங்கே இருக்கிறேன்.');
    expect(play).not.toHaveBeenCalled();
    player.endStream();
    expect(play).toHaveBeenCalledWith('வணக்கம். நான் இங்கே இருக்கிறேன்.', 'ta', expect.anything());
    expect(events.onPreparingChange).toHaveBeenLastCalledWith(true);
    expect(player.busy).toBe(true);
    await flush();
    expect(events.onSpeakingChange).toHaveBeenLastCalledWith(true);
    expect(events.onPreparingChange).toHaveBeenLastCalledWith(false);
    finish();
    await flush();
    expect(events.onSpeakingChange).toHaveBeenLastCalledWith(false);
    expect(player.busy).toBe(false);
  });

  it('goes quiet instead of using a wrong-language device voice when the natural voice is unavailable', async () => {
    playback(false);
    const events = { onSpeakingChange: vi.fn(), onPreparingChange: vi.fn() };
    const player = new SpeechPlayer(events);
    player.speak('வணக்கம்', options);
    await flush();
    expect(events.onSpeakingChange).not.toHaveBeenCalled();
    expect(events.onPreparingChange).toHaveBeenLastCalledWith(false);
    expect(player.busy).toBe(false);
  });

  it('stops the natural voice immediately', async () => {
    const { stop } = playback(true);
    const player = new SpeechPlayer({ onSpeakingChange: vi.fn() });
    player.speak('Hello', options);
    player.stop();
    expect(stop).toHaveBeenCalled();
    expect(player.busy).toBe(false);
  });
});

describe('patient listening', () => {
  type Handler = ((event: unknown) => void) | null;
  class Recognition {
    static last: Recognition;
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    lang = '';
    stopped = false;
    onresult: Handler = null;
    onerror: Handler = null;
    onend: Handler = null;
    onspeechend: Handler = null;
    start() {
      Recognition.last = this;
    }
    stop() {
      this.stopped = true;
      this.onend?.({});
    }
    abort() {
      this.onend?.({});
    }
    hear(transcript: string, isFinal: boolean) {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript, confidence: 0.9 }], { isFinal })] });
    }
  }
  const speechWindow = window as unknown as { SpeechRecognition?: unknown };
  afterEach(() => delete speechWindow.SpeechRecognition);

  it('waits through short pauses and keeps words still being recognised when the turn ends', async () => {
    speechWindow.SpeechRecognition = Recognition;
    const onFinal = vi.fn();
    startRecognition('en-IN', { onInterim: vi.fn(), onFinal, onError: vi.fn(), onEnd: vi.fn() }, { endSilenceMs: 60 });
    const rec = Recognition.last;
    expect(rec.continuous).toBe(true);
    rec.hear('I was', false);
    await new Promise((r) => setTimeout(r, 30));
    rec.hear('I was thinking', false);
    await new Promise((r) => setTimeout(r, 30));
    expect(rec.stopped).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(rec.stopped).toBe(true);
    expect(onFinal).toHaveBeenCalledWith('I was thinking', expect.anything());
  });

  it('reports no speech when nothing is heard in time', async () => {
    speechWindow.SpeechRecognition = Recognition;
    const onError = vi.fn();
    startRecognition('en-IN', { onInterim: vi.fn(), onFinal: vi.fn(), onError, onEnd: vi.fn() }, { endSilenceMs: 60, noSpeechMs: 40 });
    await new Promise((r) => setTimeout(r, 80));
    expect(onError).toHaveBeenCalledWith('no-speech');
    expect(onError).toHaveBeenCalledTimes(1);
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
