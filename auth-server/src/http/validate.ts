import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from './errors.ts';

/** Parses req.body with a shared Zod schema; throws 400 with field details on failure. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      next(badRequest('Validation failed', { fields }));
      return;
    }
    (req as Request & { body: unknown }).body = result.data;
    next();
  };
}
