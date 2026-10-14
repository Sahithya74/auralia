import { getRecognitionCtor, markRecognitionUnsupported } from './capabilities';

export type RecognitionError =
  | 'not-allowed'
  | 'no-speech'
  | 'network'
  | 'audio-capture'
  | 'language-not-supported'
  | 'unavailable'
  | 'unknown';

export interface RecognitionCallbacks {
  onInterim(text: string): void;
  onFinal(text: string, info: { confidence: number; recognitionMs: number | null }): void;
  onError(error: RecognitionError): void;
  onEnd(): void;
}

export interface Recognizer {
  stop(): void;
  abort(): void;
}

const ERROR_MAP: Record<string, RecognitionError> = {
  'not-allowed': 'not-allowed',
  'service-not-allowed': 'not-allowed',
  'no-speech': 'no-speech',
  network: 'network',
  'audio-capture': 'audio-capture',
  'language-not-supported': 'language-not-supported',
};

export interface RecognitionOptions {
  /**
   * Listen patiently: keep listening through short pauses and end the turn only
   * after this much silence. Without it, the browser ends the turn at its own,
   * often quick, pause detection.
   */
  endSilenceMs?: number;
  /** Report "no-speech" if nothing at all has been heard after this long. */
  noSpeechMs?: number;
}

/** Android Chrome repeats words in continuous mode, so patient listening is used elsewhere. */
export function canListenPatiently(): boolean {
  return typeof navigator !== 'undefined' && !/Android/i.test(navigator.userAgent);
}

/**
 * Starts one turn of speech recognition. Note: in Chrome, recognition audio
 * is processed by the browser vendor's speech service, not on the device.
 */
export function startRecognition(
  speechTag: string,
  callbacks: RecognitionCallbacks,
  options: RecognitionOptions = {},
): Recognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    callbacks.onError('unavailable');
    return null;
  }
  const patient = Boolean(options.endSilenceMs);
  const recognition = new Ctor();
  recognition.lang = speechTag;
  recognition.continuous = patient;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalText = '';
  let interimText = '';
  let confidence = 0;
  let speechEndedAt: number | null = null;
  let errored = false;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  const quietTimer = options.noSpeechMs
    ? setTimeout(() => {
        if (finalText || interimText || errored) return;
        errored = true;
        callbacks.onError('no-speech');
        recognition.abort();
      }, options.noSpeechMs)
    : undefined;

  recognition.onspeechend = () => {
    speechEndedAt = performance.now();
  };
  recognition.onresult = (event) => {
    // Rebuilt from every result each time, so nothing is counted twice.
    let final = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]!;
      const alt = result[0];
      if (!alt) continue;
      if (result.isFinal) {
        final += alt.transcript;
        confidence = alt.confidence;
      } else {
        interim += alt.transcript;
      }
    }
    finalText = final;
    interimText = interim;
    callbacks.onInterim((finalText + ' ' + interimText).trim());
    if (patient && (finalText || interimText).trim()) {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        speechEndedAt ??= performance.now();
        recognition.stop();
      }, options.endSilenceMs);
    }
  };
  recognition.onerror = (event) => {
    errored = true;
    const error = ERROR_MAP[event.error] ?? (event.error === 'aborted' ? null : 'unknown');
    if (error === 'language-not-supported') markRecognitionUnsupported(speechTag);
    if (error) callbacks.onError(error);
  };
  recognition.onend = () => {
    clearTimeout(silenceTimer);
    clearTimeout(quietTimer);
    // Words still marked interim when listening stopped are kept rather than lost.
    const text = (finalText.trim() ? finalText : interimText).trim();
    if (!errored && text) {
      callbacks.onFinal(text, {
        confidence,
        recognitionMs: speechEndedAt === null ? null : Math.round(performance.now() - speechEndedAt),
      });
    } else if (!errored) {
      callbacks.onError('no-speech');
    }
    callbacks.onEnd();
  };

  try {
    recognition.start();
  } catch {
    clearTimeout(quietTimer);
    callbacks.onError('unknown');
    callbacks.onEnd();
    return null;
  }
  return {
    stop: () => recognition.stop(),
    abort: () => {
      errored = true;
      clearTimeout(silenceTimer);
      clearTimeout(quietTimer);
      recognition.abort();
    },
  };
}
