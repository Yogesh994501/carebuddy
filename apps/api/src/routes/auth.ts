import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import {
  hashPassword,
  verifyPassword,
  generateSessionId,
  generateRecoveryCodes
} from '../utils/crypto';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies';
import { sendError } from '../utils/errors';
import { requireAuth } from '../middleware/auth';
import { loginLimiter, passwordResetLimiter } from '../middleware/rateLimit';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').trim()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  recoveryCode: z.string().min(1, 'Recovery code is required').trim(),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

/**
 * POST /api/auth/register
 * Registers user, generates 8 recovery codes (shown ONCE), creates session
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { email, password, name } = parseResult.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return sendError(res, 409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }

    const passwordHash = await hashPassword(password);
    const { plainCodes, hashedCodes } = await generateRecoveryCodes(8);

    // Create user and initial records in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name
        }
      });

      // Save recovery codes
      await tx.recoveryCode.createMany({
        data: hashedCodes.map((codeHash) => ({
          userId: user.id,
          codeHash
        }))
      });

      // Create default user settings
      await tx.userSettings.create({
        data: {
          userId: user.id
        }
      });

      // Create initial session (valid 7 days)
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const session = await tx.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          expiresAt
        }
      });

      // Append-only audit record
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_REGISTER',
          entityType: 'User',
          entityId: user.id,
          details: { email: user.email },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return { user, session, plainCodes };
    });

    setSessionCookie(res, result.session.id, result.session.expiresAt);

    return res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name
      },
      recoveryCodes: result.plainCodes,
      message: 'Account created. Store these 8 recovery codes securely. They will never be shown again.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/auth/login
 * Validates password, issues server-side session
 */
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Keep timing constant and log failed attempt
      await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$fakehashfakehashfakehashfakehashfakehash', password);
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      // Audit failed login
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'User',
          entityId: user.id,
          details: { reason: 'Incorrect password' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      }).catch(() => {});
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    // Create session (valid 7 days)
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt
      }
    });

    // Audit successful login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'AUTH_LOGIN',
        entityType: 'User',
        entityId: user.id,
        details: { email: user.email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    }).catch(() => {});

    setSessionCookie(res, session.id, session.expiresAt);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/auth/logout
 * Deletes server-side session and clears cookie
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.session) {
      await prisma.session.delete({ where: { id: req.session.id } }).catch(() => {});
    }

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'AUTH_LOGOUT',
          entityType: 'User',
          entityId: req.user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      }).catch(() => {});
    }

    clearSessionCookie(res);
    return res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/auth/forgot-password
 * Recovers password using a one-time recovery code and revokes all existing sessions
 */
router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const parseResult = forgotPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { email, recoveryCode, newPassword } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        recoveryCodes: {
          where: { usedAt: null }
        }
      }
    });

    if (!user || user.recoveryCodes.length === 0) {
      return sendError(res, 400, 'INVALID_RECOVERY_CODE', 'Invalid recovery code or email.');
    }

    // Find the matching recovery code
    let matchingCodeId: string | null = null;
    for (const code of user.recoveryCodes) {
      const match = await verifyPassword(code.codeHash, recoveryCode);
      if (match) {
        matchingCodeId = code.id;
        break;
      }
    }

    if (!matchingCodeId) {
      return sendError(res, 400, 'INVALID_RECOVERY_CODE', 'Invalid recovery code or email.');
    }

    const newPasswordHash = await hashPassword(newPassword);

    // Transaction: mark code used, update password, revoke all sessions
    const session = await prisma.$transaction(async (tx) => {
      // 1. Mark recovery code used
      await tx.recoveryCode.update({
        where: { id: matchingCodeId! },
        data: { usedAt: new Date() }
      });

      // 2. Update password
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash }
      });

      // 3. Revoke all existing sessions (Section 4 mandate)
      await tx.session.deleteMany({
        where: { userId: user.id }
      });

      // 4. Create new fresh session for this reset
      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const newSession = await tx.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          expiresAt
        }
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_PASSWORD_RESET',
          entityType: 'User',
          entityId: user.id,
          details: { recoveryCodeId: matchingCodeId },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return newSession;
    });

    setSessionCookie(res, session.id, session.expiresAt);

    return res.json({
      success: true,
      message: 'Password reset successfully. All previous sessions have been revoked.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user and preferences
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        userSettings: true,
        careNetworkMemberships: {
          where: { status: 'ACTIVE' },
          include: {
            careNetwork: {
              include: {
                profile: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found.');
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        settings: user.userSettings,
        profiles: user.careNetworkMemberships.map((m) => ({
          profileId: m.careNetwork.profileId,
          profileName: m.careNetwork.profile.name,
          role: m.role,
          isPrimaryDelegate: m.isPrimaryDelegate
        }))
      }
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

export default router;
