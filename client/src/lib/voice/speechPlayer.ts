import type { VoiceGender } from '../api/types';
import { isSynthesisAvailable } from './capabilities';
import { playNaturalVoice, type NaturalPlayback } from './naturalVoice';

export interface SpeakOptions {
  lang: string;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  /**
   * Speak with the natural server voice for this app language. When it is
   * unavailable, the device voice is used only if `deviceFallback` is true (that is,
   * the device has a voice for the language).
   */
  natural?: { language: string; deviceFallback: boolean; gender: VoiceGender };
}

export interface SpeechPlayerEvents {
  onSpeakingChange(speaking: boolean): void;
  /** True while the natural voice is being prepared, before any sound. */
  onPreparingChange?(preparing: boolean): void;
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

/** Chrome sometimes never reports the end of an utterance; this many idle seconds count as finished. */
const LOST_END_TICKS = 2;

/**
 * Speaks Anbu's replies. With the natural voice, the whole reply is sent for
 * synthesis once it is complete and plays as the audio streams in. With the device
 * voice, complete sentences are spoken as soon as they arrive while the reply is
 * still streaming.
 */
export class SpeechPlayer {
  private pending = 0;
  private buffer = '';
  private fullText = '';
  private streaming = false;
  private options: SpeakOptions | null = null;
  private generation = 0;
  /** Held so Chrome does not garbage-collect utterances before they finish. */
  private readonly utterances = new Set<SpeechSynthesisUtterance>();
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private natural: NaturalPlayback | null = null;
  private preparing = false;
  private naturalSpeaking = false;

  constructor(private readonly events: SpeechPlayerEvents) {}

  get available(): boolean {
    return isSynthesisAvailable();
  }

  /** True while preparing or speaking. */
  get busy(): boolean {
    return this.preparing || this.naturalSpeaking || this.pending > 0;
  }

  speak(text: string, options: SpeakOptions): void {
    this.stop();
    this.options = options;
    if (options.natural) {
      this.speakNatural(text);
      return;
    }
    this.speakOnDevice(text);
  }

  beginStream(options: SpeakOptions): void {
    this.stop();
    this.options = options;
    this.streaming = true;
    this.buffer = '';
    this.fullText = '';
  }

  pushStream(delta: string): void {
    if (!this.streaming) return;
    if (this.options?.natural) {
      this.fullText += delta;
      return;
    }
    this.buffer += delta;
    const { complete, rest } = splitSentences(this.buffer);
    this.buffer = rest;
    for (const s of complete) this.enqueue(s);
  }

  endStream(): void {
    if (!this.streaming) return;
    this.streaming = false;
    if (this.options?.natural) {
      const text = this.fullText;
      this.fullText = '';
      this.speakNatural(text);
      return;
    }
    this.enqueue(this.buffer);
    this.buffer = '';
    if (this.pending === 0) this.events.onSpeakingChange(false);
  }

  stop(): void {
    this.generation++;
    this.streaming = false;
    this.buffer = '';
    this.fullText = '';
    const wasSpeaking = this.pending > 0 || this.naturalSpeaking;
    this.pending = 0;
    this.utterances.clear();
    clearInterval(this.watchdog);
    this.natural?.stop();
    this.natural = null;
    this.naturalSpeaking = false;
    this.setPreparing(false);
    if (this.available) window.speechSynthesis.cancel();
    if (wasSpeaking) this.events.onSpeakingChange(false);
  }

  private setPreparing(preparing: boolean): void {
    if (this.preparing === preparing) return;
    this.preparing = preparing;
    this.events.onPreparingChange?.(preparing);
  }

  private speakNatural(raw: string): void {
    const text = cleanForSpeech(raw);
    const natural = this.options?.natural;
    if (!text || !natural) return;
    const generation = this.generation;
    const playback = playNaturalVoice(text, natural.language, {
      gender: natural.gender,
      onPulse: () => this.events.onBoundary?.(),
      preferDeviceWhenSlow: natural.deviceFallback && this.available,
      allowSlow: !(natural.deviceFallback && this.available),
    });
    this.natural = playback;
    this.setPreparing(true);
    void playback.started.then((ok) => {
      if (generation !== this.generation) return;
      if (ok) {
        this.naturalSpeaking = true;
        this.events.onSpeakingChange(true);
        this.setPreparing(false);
        void playback.finished.then(() => {
          if (generation !== this.generation) return;
          this.natural = null;
          this.naturalSpeaking = false;
          this.events.onSpeakingChange(false);
        });
        return;
      }
      this.natural = null;
      if (natural.deviceFallback && this.available) this.speakOnDevice(text);
      this.setPreparing(false);
    });
  }

  private speakOnDevice(text: string): void {
    const { complete, rest } = splitSentences(text + ' ');
    for (const s of [...complete, rest]) this.enqueue(s);
  }

  private enqueue(raw: string): void {
    const text = cleanForSpeech(raw);
    if (!text || !this.options || !this.available) return;
    const generation = this.generation;
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.options.lang;
    utterance.rate = this.options.rate;
    if (this.options.voice) utterance.voice = this.options.voice;
    utterance.onboundary = () => this.events.onBoundary?.();
    let done = false;
    const finish = () => {
      if (done || generation !== this.generation) return;
      done = true;
      this.utterances.delete(utterance);
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0) {
        clearInterval(this.watchdog);
        if (!this.streaming) this.events.onSpeakingChange(false);
      }
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    if (this.pending === 0) this.events.onSpeakingChange(true);
    this.pending++;
    this.utterances.add(utterance);
    // Chrome can get stuck paused, after which nothing is spoken.
    if (synth.paused) synth.resume();
    synth.speak(utterance);
    this.startWatchdog(generation);
  }

  private startWatchdog(generation: number): void {
    clearInterval(this.watchdog);
    let idleTicks = 0;
    this.watchdog = setInterval(() => {
      if (generation !== this.generation || this.pending === 0) return clearInterval(this.watchdog);
      const synth = window.speechSynthesis;
      idleTicks = synth.speaking || synth.pending ? 0 : idleTicks + 1;
      if (idleTicks < LOST_END_TICKS) return;
      // The browser finished without telling us: treat everything queued as spoken.
      clearInterval(this.watchdog);
      this.pending = 0;
      this.utterances.clear();
      if (!this.streaming) this.events.onSpeakingChange(false);
    }, 1000);
  }
}
