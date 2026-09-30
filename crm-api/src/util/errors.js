export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Authentication required', details) =>
  new ApiError(401, 'UNAUTHORIZED', message, details);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new ApiError(409, 'CONFLICT', message, details);
export const unprocessable = (message, details) => new ApiError(422, 'UNPROCESSABLE', message, details);
export const tooMany = (message, details) => new ApiError(429, 'RATE_LIMITED', message, details);
