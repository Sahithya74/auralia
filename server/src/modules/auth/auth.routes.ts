import { Router, type Response } from 'express';
import { z } from 'zod';
import { LANGUAGE_CODES } from '../../config/languages.js';
import type { RateLimiters } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validate.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.schemas.js';
import * as auth from './auth.service.js';
import { clearRefreshCookie, readRefreshCookie, requireClientHeader, setRefreshCookie } from './cookies.js';

function sendSession(res: Response, session: auth.SessionResult, status = 200): void {
  setRefreshCookie(res, session.refreshToken);
  res.status(status).json({ accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user });
}

export function authRoutes(limiters: RateLimiters): Router {
  const router = Router();

  router.post(
    '/register',
    limiters.register,
    validateBody(registerSchema.extend({ preferredLanguage: z.enum(LANGUAGE_CODES).optional() })),
    async (req, res) => {
      sendSession(res, await auth.register(req.body), 201);
    },
  );

  router.post('/login', limiters.login, validateBody(loginSchema), async (req, res) => {
    sendSession(res, await auth.login(req.body));
  });

  router.post('/refresh', limiters.refresh, requireClientHeader, async (req, res) => {
    try {
      sendSession(res, await auth.refreshSession(readRefreshCookie(req)));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'REFRESH_RACE') clearRefreshCookie(res);
      throw err;
    }
  });

  router.post('/logout', requireClientHeader, async (req, res) => {
    await auth.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
    res.status(204).end();
  });

  const resetSent = {
    message: 'If an account exists for that email, we have sent a link to reset the password.',
  };

  router.post('/forgot-password', limiters.passwordReset, validateBody(forgotPasswordSchema), async (req, res) => {
    await auth.requestPasswordReset(req.body.email);
    res.json(resetSent);
  });

  router.post('/reset-password', limiters.passwordReset, validateBody(resetPasswordSchema), async (req, res) => {
    await auth.resetPassword(req.body.token, req.body.password);
    clearRefreshCookie(res);
    res.json({ message: 'Your password has been changed. Please sign in.' });
  });

  return router;
}
