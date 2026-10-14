/** An error whose code and message are safe to show to the client. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Please sign in again.') =>
  new AppError(401, code, message);
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);
