import { apiFetch } from '../api/client';
import type { VoiceGender } from '../api/types';

// Plays Anbu's replies in the natural voice generated on the server. The audio
// arrives as streamed 16-bit PCM and is scheduled with the Web Audio API as it
// comes in, so speech starts before the whole reply has been synthesised.

const SAMPLE_RATE = 24_000;
/** Start playing once this much audio has arrived; a small lead absorbs network jitter. */
const FIRST_CHUNK_SECONDS = 0.2;
const CHUNK_SECONDS = 0.3;
const START_LEAD_SECONDS = 0.08;
/** Use the device voice instead if no audio has arrived by then. */
const FIRST_AUDIO_TIMEOUT_MS = 6_500;
/** With no device voice to fall back on, wait longer: a late voice beats silence. */
const SLOW_FIRST_AUDIO_TIMEOUT_MS = 15_000;
/** Stop waiting when the audio stream goes quiet partway through. */
const STALL_TIMEOUT_MS = 6_000;
const PULSE_MS = 350;
/** Audio arriving slower than it plays would stutter; below this rate it is treated as slow. */
const SLOW_RATE = 1.0;
/** On a slow connection without a device voice, wait at most this long for the whole reply. */
const SLOW_WAIT_MS = 20_000;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

let context: AudioContext | null = null;

export function isNaturalVoiceSupported(): boolean {
  return audioContextCtor() !== null && typeof ReadableStream !== 'undefined';
}

/** After the server says the natural voice is busy or used up for now, don't ask again for a while. */
const BUSY_PAUSE_MS = 2 * 60_000;
let restingUntil = 0;

export function isNaturalVoiceResting(): boolean {
  return Date.now() < restingUntil;
}

/** 2G-class connections or data saver, where streaming audio would arrive slower than it plays. */
export function isSlowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  return Boolean(connection?.saveData) || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g';
}

/**
 * Prepares audio output. Call it from a tap or click: mobile browsers only allow
 * sound that a person started.
 */
export function unlockAudio(): void {
  const Ctor = audioContextCtor();
  if (!Ctor) return;
  try {
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    // iOS unlocks audio only after something is played inside the gesture.
    const silence = context.createBufferSource();
    silence.buffer = context.createBuffer(1, 1, SAMPLE_RATE);
    silence.connect(context.destination);
    silence.start(0);
  } catch {
    context = null;
  }
}

async function runningContext(): Promise<AudioContext | null> {
  if (!context) return null;
  if (context.state === 'running') return context;
  try {
    await Promise.race([context.resume(), new Promise((resolve) => setTimeout(resolve, 300))]);
  } catch {
    return null;
  }
  return (context.state as AudioContextState) === 'running' ? context : null;
}

/**
 * Converts little-endian 16-bit PCM to samples, carrying an odd trailing byte over
 * to the next network chunk.
 */
export function pcm16ToFloat32(bytes: Uint8Array, carry: number | null): { samples: Float32Array; carry: number | null } {
  let data = bytes;
  if (carry !== null) {
    data = new Uint8Array(bytes.length + 1);
    data[0] = carry;
    data.set(bytes, 1);
  }
  const count = data.length >> 1;
  const samples = new Float32Array(count);
  const view = new DataView(data.buffer, data.byteOffset, count * 2);
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, carry: data.length % 2 === 1 ? data[data.length - 1]! : null };
}

export interface NaturalPlayback {
  /** true once audio is playing; false if it failed before any audio, so the device voice can be used. */
  started: Promise<boolean>;
  /** Settles when playback has finished or was stopped. */
  finished: Promise<void>;
  stop(): void;
}

export interface NaturalVoiceOptions {
  onPulse?(): void;
  gender?: VoiceGender;
  /** Let the server use its slower backup voices (only when the device has no voice of its own). */
  allowSlow?: boolean;
  /**
   * When the audio arrives slower than it plays, give up so the device voice can
   * speak instead. Otherwise the whole reply is downloaded first and then played
   * without gaps.
   */
  preferDeviceWhenSlow?: boolean;
}

export function playNaturalVoice(text: string, language: string, events: NaturalVoiceOptions = {}): NaturalPlayback {
  const controller = new AbortController();
  const sources = new Set<AudioBufferSourceNode>();
  let resolveStarted!: (ok: boolean) => void;
  let resolveFinished!: () => void;
  const started = new Promise<boolean>((r) => (resolveStarted = r));
  const finished = new Promise<void>((r) => (resolveFinished = r));
  let stopped = false;
  let pulse: ReturnType<typeof setInterval> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    clearInterval(pulse);
    clearTimeout(endTimer);
    resolveStarted(false);
    resolveFinished();
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    sources.clear();
    finish();
  };

  void (async () => {
    const ctx = await runningContext();
    if (!ctx || stopped) return finish();

    let nextTime = 0;
    let pending: Float32Array[] = [];
    let pendingLength = 0;
    let carry: number | null = null;
    let playing = false;

    const schedule = () => {
      if (pendingLength === 0 || stopped) return;
      const buffer = ctx.createBuffer(1, pendingLength, SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      let offset = 0;
      for (const part of pending) {
        channel.set(part, offset);
        offset += part.length;
      }
      pending = [];
      pendingLength = 0;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => sources.delete(source);
      // If the network fell behind, carry on from now instead of in the past.
      nextTime = Math.max(nextTime, ctx.currentTime + START_LEAD_SECONDS);
      source.start(nextTime);
      sources.add(source);
      nextTime += buffer.duration;
      if (!playing) {
        playing = true;
        resolveStarted(true);
        events.onPulse?.();
        pulse = setInterval(() => events.onPulse?.(), PULSE_MS);
      }
    };

    let timer = setTimeout(() => controller.abort(), events.allowSlow ? SLOW_FIRST_AUDIO_TIMEOUT_MS : FIRST_AUDIO_TIMEOUT_MS);
    let firstByteAt = 0;
    let received = 0;
    /** Slow connection without a device voice: collect everything, then play it smoothly. */
    let waitForAll = false;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const res = await apiFetch('/voice/speech', { method: 'POST', body: { text, language, gender: events.gender ?? 'FEMALE', allowSlow: Boolean(events.allowSlow) }, signal: controller.signal });
      if (!res.ok || !res.body) {
        if (res.status === 503 || res.status === 501) restingUntil = Date.now() + BUSY_PAUSE_MS;
        clearTimeout(timer);
        return finish();
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
        firstByteAt ||= performance.now();
        const converted = pcm16ToFloat32(value, carry);
        carry = converted.carry;
        pending.push(converted.samples);
        pendingLength += converted.samples.length;
        received += converted.samples.length;
        if (waitForAll) continue;
        if (!playing && pendingLength >= SAMPLE_RATE * FIRST_CHUNK_SECONDS) {
          const seconds = Math.max((performance.now() - firstByteAt) / 1000, 0.001);
          if (received / SAMPLE_RATE / seconds < SLOW_RATE) {
            if (events.preferDeviceWhenSlow) {
              controller.abort();
              clearTimeout(timer);
              return finish();
            }
            waitForAll = true;
            slowTimer = setTimeout(() => {
              stopped = true;
              controller.abort();
            }, SLOW_WAIT_MS);
            continue;
          }
        }
        if (pendingLength >= SAMPLE_RATE * (playing ? CHUNK_SECONDS : FIRST_CHUNK_SECONDS)) schedule();
      }
    } catch {
      // Network trouble or stopped: play whatever arrived.
    }
    clearTimeout(timer);
    clearTimeout(slowTimer);
    if (stopped) return finish();
    schedule();
    if (!playing) return finish();
    endTimer = setTimeout(finish, Math.max(0, (nextTime - ctx.currentTime) * 1000) + 60);
  })();

  return { started, finished, stop };
}
