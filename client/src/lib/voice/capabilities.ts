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

export function pickVoice(voices: SpeechSynthesisVoice[], speechTag: string): SpeechSynthesisVoice | null {
  const tag = speechTag.toLowerCase();
  const base = tag.split('-')[0]!;
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  return (
    voices.find((v) => norm(v) === tag && v.localService) ??
    voices.find((v) => norm(v) === tag) ??
    voices.find((v) => norm(v).split('-')[0] === base) ??
    null
  );
}

export type RecognitionSupport = 'available' | 'no-api' | 'language-rejected';
export type SynthesisSupport = 'available' | 'no-api' | 'no-voice';

export interface VoiceSupport {
  recognition: RecognitionSupport;
  synthesis: SynthesisSupport;
  voice: SpeechSynthesisVoice | null;
}

export async function detectVoiceSupport(speechTag: string): Promise<VoiceSupport> {
  const recognition: RecognitionSupport = !isRecognitionAvailable()
    ? 'no-api'
    : wasRecognitionRejected(speechTag)
      ? 'language-rejected'
      : 'available';
  if (!isSynthesisAvailable()) return { recognition, synthesis: 'no-api', voice: null };
  const voice = pickVoice(await loadVoices(), speechTag);
  return { recognition, synthesis: voice ? 'available' : 'no-voice', voice };
}
