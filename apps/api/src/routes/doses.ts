import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requirePermission } from '../middleware/profile';
import { transitionDose } from '../services/doseStateMachine';
import { calculateAdherence, AdherenceWindow } from '../services/adherence';
import { sendError } from '../utils/errors';
import { DoseActionSource } from '@prisma/client';

const router = Router({ mergeParams: true });

const actionSchema = z.object({
  reason: z.string().optional(),
  takenAt: z.string().datetime().optional()
});

const correctSchema = z.object({
  targetState: z.enum(['TAKEN', 'SKIPPED', 'MISSED', 'PENDING']),
  reason: z.string().min(1, 'A correction reason is required').trim(),
  takenAt: z.string().datetime().optional()
});

/**
 * Helper to determine action source & on-behalf flag
 */
function resolveActionSource(req: Request): {
  actionSource: DoseActionSource;
  actedOnBehalf: boolean;
} {
  const isOwner = req.isOwnerOrPrimaryDelegate;
  const role = req.membership?.role;
  const canActOnBehalf = req.membership?.actOnBehalf ?? false;

  if (isOwner) {
    return { actionSource: 'OWNER_APP', actedOnBehalf: false };
  }

  if (role === 'CAREGIVER' || role === 'FAMILY') {
    if (canActOnBehalf) {
      return { actionSource: 'CAREGIVER_ASSISTED', actedOnBehalf: true };
    }
    return { actionSource: 'CAREGIVER_APP', actedOnBehalf: false };
  }

  return { actionSource: 'OWNER_APP', actedOnBehalf: false };
}

/**
 * GET /api/profiles/:profileId/doses/today
 * Fetches doses for today in profile local timezone
 */
router.get('/today', requireAuth, resolveProfileMembership, requirePermission('viewMedications'), async (req: Request, res: Response) => {
  try {
    const timezone = req.profile!.timezone;
    const todayLocal = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');

    const doses = await prisma.medicationDose.findMany({
      where: {
        profileId: req.profile!.id,
        localDate: todayLocal,
        voidedAt: null
      },
      include: {
        medication: true,
        logs: {
          orderBy: { timestamp: 'asc' }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    return res.json({ date: todayLocal, timezone, doses });
  } catch (error) {
    console.error('Get today doses error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * GET /api/profiles/:profileId/doses
 * Fetches doses for a specific local date
 */
router.get('/', requireAuth, resolveProfileMembership, requirePermission('viewMedications'), async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const timezone = req.profile!.timezone;
    const targetDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');

    const doses = await prisma.medicationDose.findMany({
      where: {
        profileId: req.profile!.id,
        localDate: targetDate,
        voidedAt: null
      },
      include: {
        medication: true,
        logs: {
          orderBy: { timestamp: 'asc' }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    return res.json({ date: targetDate, timezone, doses });
  } catch (error) {
    console.error('Get doses error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/profiles/:profileId/doses/:id/taken
 * Marks dose as TAKEN with idempotency and optimistic locking
 */
router.post('/:id/taken', requireAuth, resolveProfileMembership, requirePermission('recordDoses'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const { takenAt } = actionSchema.parse(req.body || {});

    const { actionSource, actedOnBehalf } = resolveActionSource(req);

    const result = await transitionDose({
      doseId: id,
      targetState: 'TAKEN',
      actorUserId: req.user!.id,
      actionSource,
      actedOnBehalf,
      takenAt: takenAt ? new Date(takenAt) : undefined,
      idempotencyKey
    });

    if (result.conflict) {
      return sendError(res, 409, 'DOSE_STATE_CONFLICT', `Cannot mark dose as TAKEN from current state: ${result.dose.status}`);
    }

    return res.json({ dose: result.dose, replayed: result.idempotentReplay || false });
  } catch (error: any) {
    if (error.message === 'CONCURRENT_MODIFICATION') {
      return sendError(res, 409, 'CONCURRENT_UPDATE', 'This dose was concurrently updated. Please refresh.');
    }
    console.error('Mark taken error:', error);
    return sendError(res, 400, 'TRANSITION_ERROR', error.message);
  }
});

/**
 * POST /api/profiles/:profileId/doses/:id/skipped
 * Marks dose as SKIPPED with a reason
 */
router.post('/:id/skipped', requireAuth, resolveProfileMembership, requirePermission('recordDoses'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const { reason } = actionSchema.parse(req.body || {});

    const { actionSource, actedOnBehalf } = resolveActionSource(req);

    const result = await transitionDose({
      doseId: id,
      targetState: 'SKIPPED',
      actorUserId: req.user!.id,
      actionSource,
      actedOnBehalf,
      reason,
      idempotencyKey
    });

    if (result.conflict) {
      return sendError(res, 409, 'DOSE_STATE_CONFLICT', `Cannot mark dose as SKIPPED from current state: ${result.dose.status}`);
    }

    return res.json({ dose: result.dose, replayed: result.idempotentReplay || false });
  } catch (error: any) {
    if (error.message === 'CONCURRENT_MODIFICATION') {
      return sendError(res, 409, 'CONCURRENT_UPDATE', 'This dose was concurrently updated. Please refresh.');
    }
    console.error('Mark skipped error:', error);
    return sendError(res, 400, 'TRANSITION_ERROR', error.message);
  }
});

/**
 * POST /api/profiles/:profileId/doses/:id/snooze
 * Snoozes dose (max 3 times). Snoozing never moves the MISSED deadline.
 */
router.post('/:id/snooze', requireAuth, resolveProfileMembership, requirePermission('recordDoses'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    const { actionSource, actedOnBehalf } = resolveActionSource(req);

    const result = await transitionDose({
      doseId: id,
      targetState: 'SNOOZED',
      actorUserId: req.user!.id,
      actionSource,
      actedOnBehalf,
      idempotencyKey
    });

    if (result.conflict) {
      return sendError(res, 409, 'DOSE_STATE_CONFLICT', `Cannot snooze dose from current state: ${result.dose.status}`);
    }

    return res.json({ dose: result.dose, replayed: result.idempotentReplay || false });
  } catch (error: any) {
    if (error.message === 'CONCURRENT_MODIFICATION') {
      return sendError(res, 409, 'CONCURRENT_UPDATE', 'This dose was concurrently updated. Please refresh.');
    }
    console.error('Snooze error:', error);
    return sendError(res, 400, 'TRANSITION_ERROR', error.message);
  }
});

/**
 * POST /api/profiles/:profileId/doses/:id/correct
 * Corrects a recorded terminal dose. Reason is strictly required.
 * Preserves the historical audit and medication log trail.
 */
router.post('/:id/correct', requireAuth, resolveProfileMembership, requirePermission('recordDoses'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = correctSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { targetState, reason, takenAt } = parseResult.data;
    const { actionSource, actedOnBehalf } = resolveActionSource(req);

    const result = await transitionDose({
      doseId: id,
      targetState,
      actorUserId: req.user!.id,
      actionSource: 'CORRECTION',
      actedOnBehalf,
      reason,
      takenAt: takenAt ? new Date(takenAt) : undefined,
      isCorrection: true
    });

    if (result.conflict) {
      return sendError(res, 409, 'CORRECTION_CONFLICT', `Cannot correct dose from current state: ${result.dose.status}`);
    }

    return res.json({ dose: result.dose, corrected: true });
  } catch (error: any) {
    console.error('Correction error:', error);
    return sendError(res, 400, 'CORRECTION_ERROR', error.message);
  }
});

/**
 * GET /api/profiles/:profileId/adherence
 * Calculates adherence statistics across 'today', '7d', and '30d' windows
 */
router.get('/adherence', requireAuth, resolveProfileMembership, requirePermission('viewAdherence'), async (req: Request, res: Response) => {
  try {
    const windowParam = (req.query.window as string) || '7d';
    const validWindows: AdherenceWindow[] = ['today', '7d', '30d'];
    const window: AdherenceWindow = validWindows.includes(windowParam as any)
      ? (windowParam as AdherenceWindow)
      : '7d';

    const report = await calculateAdherence(req.profile!.id, window);
    return res.json({ report });
  } catch (error) {
    console.error('Adherence error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

export default router;
