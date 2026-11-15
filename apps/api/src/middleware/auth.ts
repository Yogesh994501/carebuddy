import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { getSessionIdFromRequest } from '../utils/cookies';
import { sendError } from '../utils/errors';
import { User, Session } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
    }
  }
}

export async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId =
      getSessionIdFromRequest(req) ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!sessionId) {
      return next();
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true }
    });

    if (!session) {
      return next();
    }

    if (session.expiresAt <= new Date()) {
      // Session has expired
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return next();
    }

    req.user = session.user;
    req.session = session;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentication is required to access this resource.');
  }
  next();
}
