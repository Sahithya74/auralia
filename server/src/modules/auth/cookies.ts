import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { forbidden } from '../../utils/errors.js';

export const REFRESH_COOKIE = 'anbu_rt';

function baseOptions() {
  return { httpOnly: true, secure: env.cookieSecure, sameSite: 'strict' as const, path: '/api/auth' };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(), maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Endpoints authenticated by cookie require a custom header. Browsers can't send
 * custom headers cross-origin without a CORS preflight, which only our own
 * origin passes - this blocks cross-site request forgery.
 */
export function requireClientHeader(req: Request, _res: Response, next: NextFunction): void {
  if (req.get('x-anbu-client') !== 'web') {
    next(forbidden('CSRF_CHECK_FAILED', 'Request rejected.'));
    return;
  }
  next();
}
