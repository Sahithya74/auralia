import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { unauthorized } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }
  const userId = verifyAccessToken(header.slice('Bearer '.length).trim());
  if (!userId) {
    next(unauthorized('TOKEN_EXPIRED', 'Your session expired. Please sign in again.'));
    return;
  }
  req.auth = { userId };
  next();
}

/** The authenticated user's id. Only call after requireAuth. */
export function currentUserId(req: Request): string {
  if (!req.auth) throw unauthorized();
  return req.auth.userId;
}
