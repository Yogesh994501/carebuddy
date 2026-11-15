import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requireOwner } from '../middleware/profile';
import { sendError } from '../utils/errors';
import {
  processAssistantChat,
  getAssistantHistory,
  deleteAssistantHistory,
  updateAiConsent
} from '../services/ai/assistantService';
import { isAiConsentActive } from '../services/ai/contextBuilder';

const router = Router({ mergeParams: true });

const chatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long').trim()
});

const consentSchema = z.object({
  granted: z.boolean()
});

/**
 * Resolves user & profile membership.
 * In DEMO mode or when requesting the demo profile, auto-attaches
 * the active demo profile and owner user so that the assistant
 * works seamlessly without requiring an explicit login session.
 */
async function resolveDemoOrAuth(req: Request, res: Response, next: NextFunction) {
  const paramProfileId = req.params.profileId;
  const isDemoProfile =
    paramProfileId === 'demo-profile-rose-01' ||
    paramProfileId === 'demo' ||
    paramProfileId?.startsWith('demo-');

  if (isDemoProfile || (env.DEMO_MODE && !req.user)) {
    try {
      let demoProfile = await prisma.elderlyProfile.findFirst({
        where: { isDemo: true },
        include: {
          careNetwork: {
            include: {
              members: {
                include: { user: true }
              }
            }
          }
        }
      });

      if (!demoProfile) {
        demoProfile = await prisma.elderlyProfile.findFirst({
          include: {
            careNetwork: {
              include: {
                members: {
                  include: { user: true }
                }
              }
            }
          }
        });
      }

      if (demoProfile && demoProfile.careNetwork && demoProfile.careNetwork.members.length > 0) {
        req.profile = demoProfile;
        const requestedRole = (req.headers['x-demo-role'] as string)?.toUpperCase();
        const matchedMember =
          demoProfile.careNetwork.members.find((m) => m.role === requestedRole) ||
          demoProfile.careNetwork.members.find((m) => m.role === 'OWNER') ||
          demoProfile.careNetwork.members[0];

        req.user = req.user || matchedMember.user;
        req.membership = matchedMember;
        req.isOwnerOrPrimaryDelegate = matchedMember.role === 'OWNER';
        return next();
      }
    } catch (err: any) {
      console.error('Error auto-resolving demo profile for assistant:', err.message);
    }
  }

  // Fallback to standard authenticated session & profile membership
  return requireAuth(req, res, () => {
    return resolveProfileMembership(req, res, next);
  });
}

/**
 * POST /api/profiles/:profileId/assistant/chat
 * Send query to Sprig assistant with emergency short-circuit & safety boundaries
 */
router.post('/chat', resolveDemoOrAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = chatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const response = await processAssistantChat({
      profileId: req.profile!.id,
      userId: req.user!.id,
      userMessage: parseResult.data.message,
      callerMember: req.membership!,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json(response);
  } catch (error: any) {
    console.error('Assistant chat error:', error);
    return sendError(res, 500, 'ASSISTANT_ERROR', 'The assistant is currently unavailable. Please try again shortly.');
  }
});

/**
 * GET /api/profiles/:profileId/assistant/history
 * Retrieve user's conversation history with Sprig for this profile
 */
router.get('/history', resolveDemoOrAuth, async (req: Request, res: Response) => {
  try {
    const history = await getAssistantHistory(req.profile!.id, req.user!.id);
    return res.json(history);
  } catch (error: any) {
    console.error('Get assistant history error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'Could not load conversation history.');
  }
});

/**
 * DELETE /api/profiles/:profileId/assistant/history
 * Clears conversation history with Sprig for this profile
 */
router.delete('/history', resolveDemoOrAuth, async (req: Request, res: Response) => {
  try {
    const count = await deleteAssistantHistory(req.profile!.id, req.user!.id);
    return res.json({ success: true, deletedCount: count });
  } catch (error: any) {
    console.error('Delete assistant history error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'Could not delete conversation history.');
  }
});

/**
 * GET /api/profiles/:profileId/assistant/consent
 * Check if AI assistant consent is active for this profile
 */
router.get('/consent', resolveDemoOrAuth, async (req: Request, res: Response) => {
  try {
    const consentActive = await isAiConsentActive(req.profile!.id, req.profile!.ownerUserId);
    return res.json({
      profileId: req.profile!.id,
      consentGranted: consentActive,
      isOwner: req.membership!.role === 'OWNER'
    });
  } catch (error: any) {
    console.error('Get assistant consent error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'Could not check consent status.');
  }
});

/**
 * PUT /api/profiles/:profileId/assistant/consent
 * Update record-sharing consent for the AI assistant (Owner only)
 */
router.put('/consent', resolveDemoOrAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const parseResult = consentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const consent = await updateAiConsent({
      profileId: req.profile!.id,
      userId: req.user!.id,
      granted: parseResult.data.granted,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      granted: consent.granted,
      updatedAt: consent.grantedAt
    });
  } catch (error: any) {
    console.error('Update assistant consent error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'Could not update AI consent.');
  }
});

export default router;
