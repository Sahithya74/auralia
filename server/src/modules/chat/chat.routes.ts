import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AIProvider } from '../../ai/types.js';
import { buildReflectionRequest } from '../../ai/prompt/reflectionPrompts.js';
import { staticSafetyMessage } from '../../ai/safety/staticMessages.js';
import { LANGUAGE_CODES } from '../../config/languages.js';
import { prisma } from '../../db.js';
import { currentUserId } from '../../middleware/auth.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import { memoryGate } from '../../persistence/memoryGate.js';
import { resolvePolicy } from '../../persistence/policy.js';
import { AppError, conflict, forbidden, unauthorized } from '../../utils/errors.js';
import { errorMeta, logger } from '../../utils/logger.js';
import { MEMORY_CATEGORIES } from '../memories/memories.routes.js';
import { asProviderError, chatSchema, clientErrorCode, prepareChat, type ChatRequest, type PreparedChat } from './chat.service.js';

const DUPLICATE_WINDOW_MS = 60_000;
const MAX_ACTIVE_STREAMS_PER_USER = 2;
const KEEPALIVE_MS = 15_000;

const reflectSchema = z
  .object({
    kind: z.enum(['summary', 'next_step', 'memory_suggestions']),
    language: z.enum(LANGUAGE_CODES),
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(8000) }))
      .min(2)
      .max(80),
  })
  .strict();

const suggestionSchema = z.array(
  z.object({
    content: z.string().trim().min(1).max(500),
    category: z.enum(MEMORY_CATEGORIES).catch('OTHER'),
    kind: z.enum(['STATED', 'INTERPRETATION']).catch('INTERPRETATION'),
    sensitive: z.boolean().catch(true),
  }),
);

export function parseMemorySuggestions(text: string) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = suggestionSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function chatRoutes(ai: AIProvider, limiters: RateLimiters): Router {
  const router = Router();
  const recentRequests = new Map<string, number>();
  const activeStreams = new Map<string, number>();

  /** Rejects a resubmitted request id (double taps, retries after a response was produced). */
  function claimRequest(userId: string, requestId: string): void {
    const now = Date.now();
    for (const [key, expires] of recentRequests) if (expires < now) recentRequests.delete(key);
    const key = `${userId}:${requestId}`;
    if (recentRequests.has(key)) throw conflict('DUPLICATE_REQUEST', 'This message was already sent.');
    recentRequests.set(key, now + DUPLICATE_WINDOW_MS);
  }

  function acquireStream(userId: string): () => void {
    const count = activeStreams.get(userId) ?? 0;
    if (count >= MAX_ACTIVE_STREAMS_PER_USER) {
      throw new AppError(429, 'CHAT_BUSY', 'Anbu is still answering your previous message.');
    }
    activeStreams.set(userId, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (activeStreams.get(userId) ?? 1) - 1;
      if (n <= 0) activeStreams.delete(userId);
      else activeStreams.set(userId, n);
    };
  }

  async function persist(userId: string, body: ChatRequest, prepared: PreparedChat, reply: string, userAt: Date) {
    try {
      const saved = await memoryGate.recordExchange(userId, {
        conversationId: body.conversationId,
        language: prepared.language,
        userText: prepared.userText,
        assistantText: reply,
        userAt,
        assistantAt: new Date(),
        replacesLast: body.replacesLast,
      });
      return saved?.conversationId ?? null;
    } catch (err) {
      logger.error('chat.persist_failed', { userId, ...errorMeta(err) });
      return null;
    }
  }

  router.post('/stream', limiters.chat, validateBody(chatSchema), async (req, res: Response) => {
    const userId = currentUserId(req);
    const body = req.body as ChatRequest;
    const t0 = performance.now();
    const userAt = new Date();

    claimRequest(userId, body.requestId);
    const release = acquireStream(userId);
    let keepAlive: NodeJS.Timeout | undefined;

    try {
      const prepared = await prepareChat(userId, body);
      const prepareMs = Math.round(performance.now() - t0);

      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      const send = (event: string, data: unknown) => {
        if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      keepAlive = setInterval(() => !res.writableEnded && res.write(': keep-alive\n\n'), KEEPALIVE_MS);

      const controller = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });

      send('meta', { safety: prepared.safety, ai: { mock: ai.isMock } });

      let reply = '';
      let ttftMs: number | null = null;
      let staticFallback = false;
      try {
        for await (const chunk of ai.stream({ system: prepared.system, turns: prepared.turns, signal: controller.signal })) {
          if (ttftMs === null) ttftMs = Math.round(performance.now() - t0);
          reply += chunk;
          send('delta', { text: chunk });
        }
      } catch (err) {
        const aiErr = asProviderError(err);
        if (aiErr.kind === 'aborted' || controller.signal.aborted) {
          // Cancelled by the user: the partial reply is discarded and nothing is stored.
          logger.info('chat.cancelled', { userId, elapsedMs: Math.round(performance.now() - t0) });
          return;
        }
        logger.warn('chat.provider_error', { userId, provider: ai.name, kind: aiErr.kind, status: aiErr.status });
        if (prepared.safety.level !== 'none' && reply.length === 0) {
          reply = staticSafetyMessage(prepared.language);
          staticFallback = true;
          send('delta', { text: reply });
        } else {
          send('error', { code: clientErrorCode(aiErr), retryable: aiErr.retryable, partial: reply.length > 0 });
          res.end();
          return;
        }
      }

      if (controller.signal.aborted) return;
      const conversationId = await persist(userId, body, prepared, reply, userAt);
      const totalMs = Math.round(performance.now() - t0);
      send('done', {
        conversationId,
        persisted: conversationId !== null,
        staticFallback,
        timing: { prepareMs, firstTokenMs: ttftMs, totalMs },
      });
      res.end();

      logger.info('chat.completed', {
        userId,
        provider: ai.name,
        model: ai.model,
        language: prepared.language,
        safetyLevel: prepared.safety.level,
        prepareMs,
        firstTokenMs: ttftMs,
        totalMs,
        replyChars: reply.length,
        persisted: conversationId !== null,
      });
    } finally {
      if (keepAlive) clearInterval(keepAlive);
      release();
    }
  });

  router.post('/', limiters.chat, validateBody(chatSchema), async (req, res) => {
    const userId = currentUserId(req);
    const body = req.body as ChatRequest;
    const t0 = performance.now();
    const userAt = new Date();
    claimRequest(userId, body.requestId);

    const prepared = await prepareChat(userId, body);
    let reply: string;
    let staticFallback = false;
    try {
      reply = await ai.complete({ system: prepared.system, turns: prepared.turns });
    } catch (err) {
      const aiErr = asProviderError(err);
      if (prepared.safety.level === 'none') {
        throw new AppError(aiErr.retryable ? 503 : 502, clientErrorCode(aiErr), 'Anbu could not reply just now.', {
          retryable: aiErr.retryable,
        });
      }
      reply = staticSafetyMessage(prepared.language);
      staticFallback = true;
    }
    const conversationId = await persist(userId, body, prepared, reply, userAt);
    res.json({
      reply,
      conversationId,
      persisted: conversationId !== null,
      staticFallback,
      safety: prepared.safety,
      ai: { mock: ai.isMock },
      timing: { totalMs: Math.round(performance.now() - t0) },
    });
  });

  router.post('/reflect', limiters.chat, validateBody(reflectSchema), async (req, res) => {
    const userId = currentUserId(req);
    const body = req.body as z.infer<typeof reflectSchema>;
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { preferences: true } });
    if (!user) throw unauthorized();

    if (body.kind === 'memory_suggestions') {
      const policy = resolvePolicy(user.memoryMode, user.preferences?.historyEnabled ?? false);
      if (!policy.memories) throw forbidden('PERSISTENCE_BLOCKED', "Your privacy settings don't allow saving memories.");
    }

    const request = buildReflectionRequest(body.kind, body.language, user.preferences?.codeMixing ?? true, body.messages);
    let text: string;
    try {
      text = await ai.complete(request);
    } catch (err) {
      const aiErr = asProviderError(err);
      throw new AppError(aiErr.retryable ? 503 : 502, clientErrorCode(aiErr), 'Anbu could not do that just now.', {
        retryable: aiErr.retryable,
      });
    }

    if (body.kind === 'memory_suggestions') {
      // Suggestions are returned for her to choose from; nothing is saved here.
      res.json({ suggestions: ai.isMock ? [] : parseMemorySuggestions(text), ai: { mock: ai.isMock } });
      return;
    }
    res.json({ text: text.trim(), ai: { mock: ai.isMock } });
  });

  return router;
}
