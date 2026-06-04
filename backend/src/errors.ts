import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Wrap async route handlers so thrown/rejected errors reach errorMiddleware (Express 4 doesn't do this automatically). */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) { res.status(err.status).json({ error: err.code, message: err.message }); return; }
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: 'Unexpected error' });
}
