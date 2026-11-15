import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership } from '../middleware/profile';
import { sseService } from '../services/sseService';

const router = Router({ mergeParams: true });

/**
 * GET /api/profiles/:profileId/events
 * Real-time Server-Sent Events stream for profile updates
 * Carries only { type, profileId, entityId }, never health data (Section 2 & 9)
 */
router.get('/', requireAuth, resolveProfileMembership, (req: Request, res: Response) => {
  const profileId = req.profile!.id;
  const userId = req.user!.id;

  const clientId = sseService.addClient(userId, profileId, res);

  req.on('close', () => {
    sseService.removeClient(clientId);
  });
});

export default router;
