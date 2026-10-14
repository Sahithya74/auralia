import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

/** Parses and replaces req.body; unknown keys are stripped by the schema. */
export function validateBody<S extends z.ZodType>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}

export function parseParams<S extends z.ZodType>(schema: S, req: Request): z.infer<S> {
  return schema.parse(req.params);
}
