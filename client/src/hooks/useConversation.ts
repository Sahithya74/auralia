import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api/client';
import { streamChat, type ChatDone } from '../lib/api/chatStream';
import type { ChatTurn, Mood, SafetyInfo } from '../lib/api/types';
import { KEYS, session } from '../lib/storage';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'voice' | 'text';
  status: 'done' | 'streaming' | 'error' | 'stopped';
  /** Epoch milliseconds when the message was sent or the reply started. */
  at?: number;
  safety?: SafetyInfo;
  timing?: ChatDone['timing'];
  errorCode?: string;
  retryable?: boolean;
}

export interface ReplyEvents {
  onReplyStart?(): void;
  onDelta?(text: string): void;
  onReplyEnd?(message: UiMessage, outcome: 'done' | 'error' | 'stopped'): void;
}

interface Options {
  userId: string;
  /** False in No-memory mode: context then lives only in this page's memory. */
  keepInTab: boolean;
  language: string;
  mood?: Mood;
  events: React.RefObject<ReplyEvents>;
}

interface Stored {
  messages: UiMessage[];
  conversationId?: string;
}

const RETRYABLE_REQUEST_ERRORS = new Set(['NETWORK', 'RATE_LIMITED', 'CHAT_BUSY', 'INTERNAL', 'HTTP_502', 'HTTP_503']);

export function toContext(messages: UiMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.content.trim() && (m.role === 'user' || m.status === 'done'))
    .map((m) => ({ role: m.role, content: m.content }));
}

function restore(key: string, enabled: boolean): Stored {
  if (!enabled) return { messages: [] };
  try {
    const raw = session.get(key);
    if (!raw) return { messages: [] };
    const parsed = JSON.parse(raw) as Stored;
    return { messages: parsed.messages.filter((m) => m.status !== 'streaming'), conversationId: parsed.conversationId };
  } catch {
    return { messages: [] };
  }
}

export function useConversation({ userId, keepInTab, language, mood, events }: Options) {
  const storageKey = KEYS.conversationPrefix + userId;
  const [initial] = useState(() => restore(storageKey, keepInTab));
  const [messages, setMessages] = useState<UiMessage[]>(initial.messages);
  const [conversationId, setConversationId] = useState<string | undefined>(initial.conversationId);
  const [pending, setPending] = useState(false);
  const messagesRef = useRef(messages);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  messagesRef.current = messages;

  useEffect(() => {
    if (!keepInTab) {
      session.remove(storageKey);
      return;
    }
    const settled = messages.filter((m) => m.status !== 'streaming');
    if (settled.length === 0) session.remove(storageKey);
    else session.set(storageKey, JSON.stringify({ messages: settled, conversationId } satisfies Stored));
  }, [messages, conversationId, keepInTab, storageKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (id: string, change: Partial<UiMessage> | ((m: UiMessage) => Partial<UiMessage>)) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)));

  const send = useCallback(
    async (text: string, opts: { source: 'voice' | 'text'; replacesLast?: boolean }) => {
      const content = text.trim();
      if (!content || pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);

      let base = messagesRef.current;
      if (opts.replacesLast) {
        const lastUser = base.map((m) => m.role).lastIndexOf('user');
        if (lastUser !== -1) base = base.slice(0, lastUser);
      }
      const now = Date.now();
      const userMsg: UiMessage = { id: crypto.randomUUID(), role: 'user', content, source: opts.source, status: 'done', at: now };
      const assistantId = crypto.randomUUID();
      let reply: UiMessage = { id: assistantId, role: 'assistant', content: '', status: 'streaming', at: now };
      setMessages([...base, userMsg, reply]);

      const controller = new AbortController();
      abortRef.current = controller;
      events.current?.onReplyStart?.();

      const patch = (change: Partial<UiMessage>) => {
        reply = { ...reply, ...change };
        update(assistantId, change);
      };

      let outcome: 'done' | 'error' | 'stopped' = 'done';
      try {
        await streamChat(
          {
            requestId: crypto.randomUUID(),
            conversationId,
            language,
            messages: toContext([...base, userMsg]),
            mood,
            replacesLast: opts.replacesLast || undefined,
          },
          {
            onMeta: ({ safety }) => patch({ safety }),
            onDelta: (delta) => {
              reply = { ...reply, content: reply.content + delta };
              update(assistantId, (m) => ({ content: m.content + delta }));
              events.current?.onDelta?.(delta);
            },
            onDone: (done) => {
              patch({ status: 'done', timing: done.timing });
              if (done.conversationId) setConversationId(done.conversationId);
            },
            onError: (err) => {
              outcome = 'error';
              patch({ status: 'error', errorCode: err.code, retryable: err.retryable });
            },
          },
          controller.signal,
        );
      } catch (err) {
        if (controller.signal.aborted || (err as Error).name === 'AbortError') {
          outcome = 'stopped';
          patch({ status: 'stopped' });
        } else {
          outcome = 'error';
          const code = err instanceof ApiError ? err.code : 'NETWORK';
          patch({ status: 'error', errorCode: code, retryable: RETRYABLE_REQUEST_ERRORS.has(code) });
        }
      } finally {
        if (controller.signal.aborted && outcome !== 'stopped') {
          outcome = 'stopped';
          patch({ status: 'stopped' });
        }
        abortRef.current = null;
        pendingRef.current = false;
        setPending(false);
        events.current?.onReplyEnd?.(reply, outcome);
      }
    },
    [conversationId, language, mood, events],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(() => {
    const list = messagesRef.current;
    const lastUserIndex = list.map((m) => m.role).lastIndexOf('user');
    const lastUser = list[lastUserIndex];
    if (!lastUser || pendingRef.current) return;
    setMessages(list.slice(0, lastUserIndex));
    messagesRef.current = list.slice(0, lastUserIndex);
    void send(lastUser.content, { source: lastUser.source ?? 'text' });
  }, [send]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    session.remove(storageKey);
    messagesRef.current = [];
    setMessages([]);
    setConversationId(undefined);
  }, [storageKey]);

  const load = useCallback((loaded: UiMessage[], id: string) => {
    messagesRef.current = loaded;
    setMessages(loaded);
    setConversationId(id);
  }, []);

  return { messages, pending, conversationId, send, stop, retry, reset, load };
}
