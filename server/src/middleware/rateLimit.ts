import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

function limitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a little and try again.' },
  });
}

const base = { standardHeaders: 'draft-8' as const, legacyHeaders: false, handler: limitHandler };

const userOrIp = (req: Request) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? '0.0.0.0');

/** Fresh limiter instances per app so tests (and multiple app instances) don't share counters. */
export function createRateLimiters() {
  return {
    // Only failed sign-ins count towards the limit.
    login: rateLimit({ ...base, windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true }),
    register: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 10 }),
    passwordReset: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 5 }),
    refresh: rateLimit({ ...base, windowMs: 15 * 60_000, limit: 60 }),
    api: rateLimit({ ...base, windowMs: 15 * 60_000, limit: 600, keyGenerator: userOrIp }),
    chat: rateLimit({ ...base, windowMs: 60_000, limit: 20, keyGenerator: userOrIp }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
