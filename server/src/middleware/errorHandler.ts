import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { errorMeta, logger } from '../utils/logger.js';

interface ErrorBody {
  error: { code: string; message: string; fields?: string[]; details?: Record<string, unknown> };
}

export function notFoundHandler(_req: Request, res: Response<ErrorBody>): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
}

export function errorHandler(err: unknown, req: Request, res: Response<ErrorBody>, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof ZodError) {
    // Only field paths are returned or logged - never the submitted values.
    const fields = [...new Set(err.issues.map((i) => i.path.join('.') || '(body)'))];
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Some details are missing or invalid.', fields } });
    return;
  }

  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request could not be read.' } });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'That message is too long.' } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
    return;
  }

  logger.error('request.unhandled_error', { method: req.method, path: req.path, ...errorMeta(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } });
}
