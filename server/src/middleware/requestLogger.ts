import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

/** Logs method, path, status and duration. Bodies and query strings are never logged. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  // Captured now: routers rewrite req.url while handling the request.
  const path = req.originalUrl.split('?')[0] ?? '';
  res.on('finish', () => {
    if (path === '/api/health') return;
    logger.info('http.request', {
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - start),
    });
  });
  next();
}
