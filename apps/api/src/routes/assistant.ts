import { Router, Request, Response } from 'express';
import { z } from 'zod';
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
 * POST /api/profiles/:profileId/assistant/chat
 * Send query to Sprig assistant with emergency short-circuit & safety boundaries
 */
router.post('/chat', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
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
router.get('/history', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
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
router.delete('/history', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
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
router.get('/consent', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
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
router.put('/consent', requireAuth, resolveProfileMembership, requireOwner, async (req: Request, res: Response) => {
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
