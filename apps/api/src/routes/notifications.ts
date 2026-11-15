import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../utils/errors';
import {
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationPreferences,
  updateNotificationPreference
} from '../services/notificationService';
import { prisma } from '../db/prisma';

const router = Router();

// Validation schemas
const getNotificationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

const updatePreferenceSchema = z.object({
  profileId: z.string().uuid(),
  type: z.enum([
    'DOSE_UPCOMING',
    'DOSE_MISSED',
    'APPOINTMENT_UPCOMING',
    'APPOINTMENT_CHANGED',
    'MEDICATION_CHANGED',
    'INVITATION_ACCEPTED',
    'ACCESS_REVOKED',
    'PERMISSIONS_CHANGED',
    'CAREGIVER_ACTIVITY'
  ]),
  enabled: z.boolean()
});

/**
 * GET /api/notifications
 * List notifications for the authenticated caller
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const query = getNotificationsQuerySchema.parse(req.query);
    const result = await getNotificationsForUser(req.user!.id, query);
    res.json(result);
  } catch (err: any) {
    sendError(res, 400, 'INVALID_QUERY', err.message);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const updated = await markNotificationAsRead(req.params.id, req.user!.id);
    if (!updated) {
      return sendError(res, 404, 'NOT_FOUND', 'Notification not found or access denied');
    }
    res.json(updated);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all caller notifications as read
 */
router.post('/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const profileId = typeof req.body?.profileId === 'string' ? req.body.profileId : undefined;
    const result = await markAllNotificationsAsRead(req.user!.id, profileId);
    res.json(result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * GET /api/notification-preferences
 * List preferences for a profile
 */
router.get('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const profileId = req.query.profileId as string;
    if (!profileId) {
      return sendError(res, 400, 'MISSING_PROFILE_ID', 'profileId query parameter is required');
    }

    // Verify caller is member or owner of this profile
    const member = await prisma.careNetworkMember.findFirst({
      where: {
        userId: req.user!.id,
        status: 'ACTIVE',
        careNetwork: { profileId }
      }
    });

    if (!member) {
      return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found or access denied');
    }

    const preferences = await getNotificationPreferences(req.user!.id, profileId);
    res.json({ profileId, preferences });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * PUT /api/notification-preferences
 * Update preference for a profile
 */
router.put('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = updatePreferenceSchema.parse(req.body);

    // Verify caller is member or owner of this profile
    const member = await prisma.careNetworkMember.findFirst({
      where: {
        userId: req.user!.id,
        status: 'ACTIVE',
        careNetwork: { profileId: body.profileId }
      }
    });

    if (!member) {
      return sendError(res, 404, 'PROFILE_NOT_FOUND', 'Profile not found or access denied');
    }

    const updated = await updateNotificationPreference(
      req.user!.id,
      body.profileId,
      body.type,
      body.enabled
    );

    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return sendError(res, 400, 'VALIDATION_ERROR', err.errors[0].message);
    }
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
