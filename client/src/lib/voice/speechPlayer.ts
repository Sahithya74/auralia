import { isSynthesisAvailable } from './capabilities';

export interface SpeakOptions {
  lang: string;
  rate: number;
  voice: SpeechSynthesisVoice | null;
}

export interface SpeechPlayerEvents {
  onSpeakingChange(speaking: boolean): void;
  /** Fires on word boundaries when the voice reports them, to animate the companion. */
  onBoundary?(): void;
}

// Sentence ends in Latin and Indic scripts (। is the Devanagari danda).
const SENTENCE_END = /[.!?।॥\n]+["')\]]*\s+/g;

export function splitSentences(text: string): { complete: string[]; rest: string } {
  const complete: string[] = [];
  let last = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    const sentence = text.slice(last, end).trim();
    if (sentence) complete.push(sentence);
    last = end;
  }
  return { complete, rest: text.slice(last) };
}

export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[Development mock[^\]]*\]/g, '')
    .replace(/[*_#`>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Speaks text sentence by sentence. While a reply is still streaming, complete
 * sentences are spoken as soon as they arrive, so speech starts before the whole
 * reply has been generated.
 */
export class SpeechPlayer {
  private pending = 0;
  private buffer = '';
  private streaming = false;
  private options: SpeakOptions | null = null;
  private generation = 0;

  constructor(private readonly events: SpeechPlayerEvents) {}

  get available(): boolean {
    return isSynthesisAvailable();
  }

  speak(text: string, options: SpeakOptions): void {
    this.stop();
    this.options = options;
    const { complete, rest } = splitSentences(text + ' ');
    for (const s of [...complete, rest]) this.enqueue(s);
  }

  beginStream(options: SpeakOptions): void {
    this.stop();
    this.options = options;
    this.streaming = true;
    this.buffer = '';
  }

  pushStream(delta: string): void {
    if (!this.streaming) return;
    this.buffer += delta;
    const { complete, rest } = splitSentences(this.buffer);
    this.buffer = rest;
    for (const s of complete) this.enqueue(s);
  }

  endStream(): void {
    if (!this.streaming) return;
    this.streaming = false;
    this.enqueue(this.buffer);
    this.buffer = '';
    if (this.pending === 0) this.events.onSpeakingChange(false);
  }

  stop(): void {
    this.generation++;
    this.streaming = false;
    this.buffer = '';
    const wasSpeaking = this.pending > 0;
    this.pending = 0;
    if (this.available) window.speechSynthesis.cancel();
    if (wasSpeaking) this.events.onSpeakingChange(false);
  }

  private enqueue(raw: string): void {
    const text = cleanForSpeech(raw);
    if (!text || !this.options || !this.available) return;
    const generation = this.generation;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.options.lang;
    utterance.rate = this.options.rate;
    if (this.options.voice) utterance.voice = this.options.voice;
    utterance.onboundary = () => this.events.onBoundary?.();
    const finish = () => {
      if (generation !== this.generation) return;
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0 && !this.streaming) this.events.onSpeakingChange(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    if (this.pending === 0) this.events.onSpeakingChange(true);
    this.pending++;
    window.speechSynthesis.speak(utterance);
  }
}
