import type { VoiceGender } from '../api/types';

// What this browser can actually do for each language. Support for Tamil,
// Malayalam, Kannada and Telugu varies a lot by browser and device, so the app
// detects it instead of assuming, and falls back to text with a clear message.

export function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isRecognitionAvailable(): boolean {
  return getRecognitionCtor() !== null;
}

export function isSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Languages the recognition service rejected during this visit. */
const rejectedRecognitionLanguages = new Set<string>();

export function markRecognitionUnsupported(speechTag: string): void {
  rejectedRecognitionLanguages.add(speechTag);
}

export function wasRecognitionRejected(speechTag: string): boolean {
  return rejectedRecognitionLanguages.has(speechTag);
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Voice lists load asynchronously in Chrome; wait briefly for them. */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!isSynthesisAvailable()) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  if (voicesPromise) return voicesPromise;
  const pending = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, timeoutMs);
  }).then((voices) => {
    // Some browsers never fire voiceschanged; try again next time instead of caching an empty list.
    if (voices.length === 0) voicesPromise = null;
    return voices;
  });
  voicesPromise = pending;
  return pending;
}

/** Neural voices (Edge "Online (Natural)", Google, Apple enhanced) sound far more human than older system voices. */
const NATURAL_VOICE = /natural|neural|online|google|enhanced|premium|siri/i;
/**
 * Built-in neural voices (Edge "Online (Natural)", Apple enhanced) sound human, start
 * instantly and have no daily limit, so they are used before the server's voice.
 */
export function isNeuralVoice(voice: SpeechSynthesisVoice | null | undefined): boolean {
  return Boolean(voice && /natural|neural|enhanced|premium/i.test(voice.name));
}

/** Voices known by name to be a woman's or a man's (Windows, Edge, Google, Apple and Android names). */
const FEMALE_VOICE =
  /female|woman|zira|hazel|susan|heera|kalpana|neerja|swara|pallavi|sobhana|sapna|shruti|aditi|lekha|veena|raveena|kajal|vani|meera|ananya|aarohi|kavya|google us english|google हिन्दी/i;
const MALE_VOICE = /male|man|david|mark|george|ravi|hemant|valluvar|prabhat|madhur|midhun|gagan|mohan|kunal|aarav|rishi|guy|ryan/i;

/**
 * The most natural voice of the chosen gender for the language. A voice known to
 * be the other gender is never used; one whose gender is unknown can be.
 */
export function pickVoice(voices: SpeechSynthesisVoice[], speechTag: string, gender: VoiceGender = 'FEMALE'): SpeechSynthesisVoice | null {
  const tag = speechTag.toLowerCase();
  const base = tag.split('-')[0]!;
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  const score = (v: SpeechSynthesisVoice) => {
    const lang = norm(v);
    if (lang !== tag && lang.split('-')[0] !== base) return -1;
    const female = FEMALE_VOICE.test(v.name);
    const male = !female && MALE_VOICE.test(v.name);
    if ((gender === 'FEMALE' && male) || (gender === 'MALE' && female)) return -1;
    const chosen = gender === 'FEMALE' ? female : male;
    return (chosen ? 16 : 0) + (lang === tag ? 8 : 0) + (NATURAL_VOICE.test(v.name) ? 4 : 0) + (v.localService ? 1 : 0);
  };
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

export type RecognitionSupport = 'available' | 'no-api' | 'language-rejected';
export type SynthesisSupport = 'available' | 'no-api' | 'no-voice';

export interface VoiceSupport {
  recognition: RecognitionSupport;
  synthesis: SynthesisSupport;
  voice: SpeechSynthesisVoice | null;
}

export async function detectVoiceSupport(speechTag: string, gender: VoiceGender = 'FEMALE'): Promise<VoiceSupport> {
  const recognition: RecognitionSupport = !isRecognitionAvailable()
    ? 'no-api'
    : wasRecognitionRejected(speechTag)
      ? 'language-rejected'
      : 'available';
  if (!isSynthesisAvailable()) return { recognition, synthesis: 'no-api', voice: null };
  const voice = pickVoice(await loadVoices(), speechTag, gender);
  return { recognition, synthesis: voice ? 'available' : 'no-voice', voice };
}
