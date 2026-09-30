export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new ApiError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Authentication required', details?: Record<string, unknown>) =>
  new ApiError(401, 'UNAUTHORIZED', message, details);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new ApiError(409, 'CONFLICT', message, details);
export const unprocessable = (message: string, details?: Record<string, unknown>) =>
  new ApiError(422, 'UNPROCESSABLE', message, details);
export const tooMany = (message: string, details?: Record<string, unknown>) =>
  new ApiError(429, 'RATE_LIMITED', message, details);
export const internal = (message = 'Internal server error') => new ApiError(500, 'INTERNAL', message);
