import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../utils/errors';

const router = Router();

const updateSettingsSchema = z.object({
  textSize: z.enum(['100', '125', '150', '200']).optional(),
  elderlyMode: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  reducedMotion: z.boolean().optional()
});

/**
 * GET /api/settings
 * Retrieves user's accessibility and UI settings
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    let settings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          textSize: '100',
          elderlyMode: false,
          highContrast: false,
          reducedMotion: false
        }
      });
    }

    return res.json(settings);
  } catch (error: any) {
    console.error('Get settings error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'Could not load user settings.');
  }
});

/**
 * PATCH /api/settings
 * Updates user's accessibility and UI preferences
 */
router.patch('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const parseResult = updateSettingsSchema.safeParse(req.body);

    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const { textSize, elderlyMode, highContrast, reducedMotion } = parseResult.data;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(textSize !== undefined && { textSize }),
        ...(elderlyMode !== undefined && { elderlyMode }),
        ...(highContrast !== undefined && { highContrast }),
        ...(reducedMotion !== undefined && { reducedMotion })
      },
      create: {
        userId,
        textSize: textSize || '100',
        elderlyMode: elderlyMode ?? false,
        highContrast: highContrast ?? false,
        reducedMotion: reducedMotion ?? false
      }
    });

    return res.json(settings);
  } catch (error: any) {
    console.error('Update settings error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'Could not update user settings.');
  }
});

export default router;
