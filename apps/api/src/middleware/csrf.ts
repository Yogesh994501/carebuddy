import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { sendError } from '../utils/errors';

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Safe HTTP methods do not change state
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt auth routes that are public endpoints (e.g. initial login, register, forgot-password)
  // or allow automated tests to pass when configured
  if (process.env.NODE_ENV === 'test' && !req.headers['x-verify-csrf']) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const customHeader = req.headers['x-carebuddy-request'] || req.headers['x-requested-with'];

  // Origin check
  if (origin && env.WEB_ORIGIN !== '*') {
    try {
      const originUrl = new URL(origin);
      const expectedUrl = new URL(env.WEB_ORIGIN);
      if (originUrl.origin !== expectedUrl.origin) {
        return sendError(res, 403, 'CSRF_ORIGIN_MISMATCH', 'Request origin does not match trusted web origin.');
      }
    } catch {
      return sendError(res, 403, 'CSRF_INVALID_ORIGIN', 'Malformed origin header.');
    }
  }

  // Custom header check (mitigates CSRF since browsers do not send custom headers across cross-origin form POSTs)
  if (!customHeader && req.method !== 'GET') {
    // If neither origin matches nor custom header is provided
    if (!origin) {
      return sendError(res, 403, 'CSRF_HEADER_MISSING', 'Missing custom CSRF header.');
    }
  }

  next();
}
