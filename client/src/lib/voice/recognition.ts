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

/**
 * Starts one utterance of speech recognition. Note: in Chrome, recognition audio
 * is processed by the browser vendor's speech service, not on the device.
 */
export function startRecognition(speechTag: string, callbacks: RecognitionCallbacks): Recognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    callbacks.onError('unavailable');
    return null;
  }
  const recognition = new Ctor();
  recognition.lang = speechTag;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalText = '';
  let confidence = 0;
  let speechEndedAt: number | null = null;
  let errored = false;

  recognition.onspeechend = () => {
    speechEndedAt = performance.now();
  };
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]!;
      const alt = result[0];
      if (!alt) continue;
      if (result.isFinal) {
        finalText += alt.transcript;
        confidence = alt.confidence;
      } else {
        interim += alt.transcript;
      }
    }
    callbacks.onInterim((finalText + ' ' + interim).trim());
  };
  recognition.onerror = (event) => {
    errored = true;
    const error = ERROR_MAP[event.error] ?? (event.error === 'aborted' ? null : 'unknown');
    if (error === 'language-not-supported') markRecognitionUnsupported(speechTag);
    if (error) callbacks.onError(error);
  };
  recognition.onend = () => {
    const text = finalText.trim();
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
    callbacks.onError('unknown');
    callbacks.onEnd();
    return null;
  }
  return {
    stop: () => recognition.stop(),
    abort: () => {
      errored = true;
      recognition.abort();
    },
  };
}
