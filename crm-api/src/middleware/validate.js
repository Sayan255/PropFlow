import { ApiError } from './errors.js';

/** Validates req.body against a shared Zod schema (400 with field details on failure). */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', { fields }));
    }
    req.body = result.data;
    next();
  };
}

/** Validates req.query; attaches parsed value to req.parsedQuery. */
export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid query', { fields }));
    }
    req.parsedQuery = result.data;
    next();
  };
}
