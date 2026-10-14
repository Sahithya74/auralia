import { apiFetch, ApiError, readError } from './client';
import { createSseParser } from './sse';
import type { ChatTurn, Mood, SafetyInfo } from './types';

export interface ChatRequest {
  requestId: string;
  conversationId?: string;
  language: string;
  messages: ChatTurn[];
  mood?: Mood;
  replacesLast?: boolean;
  /** "voice" asks for short, flowing spoken replies. */
  channel?: 'voice' | 'text';
}

export interface ChatDone {
  conversationId: string | null;
  persisted: boolean;
  staticFallback: boolean;
  timing: { prepareMs: number; firstTokenMs: number | null; totalMs: number };
}

export interface ChatStreamError {
  code: string;
  retryable: boolean;
  partial: boolean;
}

export interface ChatStreamHandlers {
  onMeta(meta: { safety: SafetyInfo; ai: { mock: boolean } }): void;
  onDelta(text: string): void;
  onDone(done: ChatDone): void;
  onError(error: ChatStreamError): void;
}

/** The server sends a keep-alive every 15s; silence longer than this means the connection is gone. */
const STALL_TIMEOUT_MS = 45_000;

export async function streamChat(body: ChatRequest, handlers: ChatStreamHandlers, signal: AbortSignal): Promise<void> {
  const res = await apiFetch('/chat/stream', { method: 'POST', body, signal });
  if (!res.ok) throw await readError(res);
  if (!res.body) throw new ApiError(0, 'NETWORK', 'No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let finished = false;
  const parser = createSseParser(({ event, data }) => {
    const payload = JSON.parse(data);
    if (event === 'meta') handlers.onMeta(payload);
    else if (event === 'delta') handlers.onDelta(payload.text);
    else if (event === 'done') {
      finished = true;
      handlers.onDone(payload);
    } else if (event === 'error') {
      finished = true;
      handlers.onError(payload);
    }
  });

  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => void reader.cancel('stalled'), STALL_TIMEOUT_MS);
  };

  try {
    armStallTimer();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armStallTimer();
      parser.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    clearTimeout(stallTimer);
  }
  if (!finished && !signal.aborted) {
    handlers.onError({ code: 'NETWORK', retryable: true, partial: true });
  }
}
