import { Router } from 'express';
import { z } from 'zod';
import { cleanSpeechText, SPEECH_MIME, type GeminiSpeech, type SpeechStream } from '../../ai/speech/geminiSpeech.js';
import { LANGUAGE_CODES } from '../../config/languages.js';
import { currentUserId } from '../../middleware/auth.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import { AppError } from '../../utils/errors.js';
import { errorMeta, logger } from '../../utils/logger.js';

export const speechSchema = z
  .object({
    text: z.string().trim().min(1).max(1500),
    language: z.enum(LANGUAGE_CODES),
    gender: z.enum(['FEMALE', 'MALE']).default('FEMALE'),
    /** The device has no voice to fall back on, so a slow natural voice is better than none. */
    allowSlow: z.boolean().default(false),
  })
  .strict();

/**
 * Speaks one of Anbu's replies in a natural voice. The reply text is sent to the
 * speech provider and nothing is stored. Responds with streamed 16-bit PCM, or 503
 * when no voice is available so the app can use the device's own voice instead.
 */
export function voiceRoutes(speech: GeminiSpeech | null, limiters: RateLimiters): Router {
  const router = Router();

  router.post('/speech', limiters.speech, validateBody(speechSchema), async (req, res) => {
    const userId = currentUserId(req);
    const body = req.body as z.infer<typeof speechSchema>;
    if (!speech) throw new AppError(501, 'VOICE_UNAVAILABLE', 'Natural voice is not set up.', { retryable: false });
    const text = cleanSpeechText(body.text);
    if (!text) throw new AppError(400, 'NO_TEXT', 'There is nothing to say.');

    const t0 = performance.now();
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    let stream: SpeechStream;
    try {
      stream = await speech.stream({ text, gender: body.gender, allowSlow: body.allowSlow, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) return;
      logger.warn('voice.unavailable', { userId, ...errorMeta(err) });
      throw new AppError(503, 'VOICE_BUSY', 'Natural voice is busy right now.', { retryable: true });
    }

    const firstAudioMs = Math.round(performance.now() - t0);
    res.status(200).set({
      'Content-Type': SPEECH_MIME,
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    let bytes = 0;
    let interrupted = false;
    try {
      for await (const chunk of stream.chunks) {
        if (controller.signal.aborted) break;
        bytes += chunk.length;
        res.write(chunk);
      }
    } catch (err) {
      interrupted = !controller.signal.aborted;
      if (interrupted) logger.warn('voice.interrupted', { userId, model: stream.model, ...errorMeta(err) });
    }
    if (!res.writableEnded) res.end();

    logger.info('voice.speech', {
      userId,
      model: stream.model,
      language: body.language,
      gender: body.gender,
      chars: text.length,
      firstAudioMs,
      totalMs: Math.round(performance.now() - t0),
      audioMs: Math.round((bytes / 2 / 24_000) * 1000),
      cancelled: controller.signal.aborted,
      interrupted,
    });
  });

  return router;
}
