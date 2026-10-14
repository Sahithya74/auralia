import { apiFetch } from '../api/client';

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
/** Stop waiting when the audio stream goes quiet partway through. */
const STALL_TIMEOUT_MS = 6_000;
const PULSE_MS = 350;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

let context: AudioContext | null = null;

export function isNaturalVoiceSupported(): boolean {
  return audioContextCtor() !== null && typeof ReadableStream !== 'undefined';
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

export function playNaturalVoice(text: string, language: string, events: { onPulse?(): void } = {}): NaturalPlayback {
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

    let timer = setTimeout(() => controller.abort(), FIRST_AUDIO_TIMEOUT_MS);
    try {
      const res = await apiFetch('/voice/speech', { method: 'POST', body: { text, language }, signal: controller.signal });
      if (!res.ok || !res.body) {
        clearTimeout(timer);
        return finish();
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
        const converted = pcm16ToFloat32(value, carry);
        carry = converted.carry;
        pending.push(converted.samples);
        pendingLength += converted.samples.length;
        if (pendingLength >= SAMPLE_RATE * (playing ? CHUNK_SECONDS : FIRST_CHUNK_SECONDS)) schedule();
      }
    } catch {
      // Network trouble or stopped: play whatever arrived.
    }
    clearTimeout(timer);
    if (stopped) return;
    schedule();
    if (!playing) return finish();
    endTimer = setTimeout(finish, Math.max(0, (nextTime - ctx.currentTime) * 1000) + 60);
  })();

  return { started, finished, stop };
}
