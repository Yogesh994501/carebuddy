import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requirePermission } from '../middleware/profile';
import { sendError } from '../utils/errors';
import { sendNotification } from '../services/notificationService';

const router = Router({ mergeParams: true });

const createNoteSchema = z.object({
  note: z.string().min(1, 'Note content cannot be empty').max(2000, 'Note is too long').trim(),
  isFlagged: z.boolean().default(false)
});

/**
 * GET /api/profiles/:profileId/notes
 * List caregiver notes for the profile
 */
router.get('/', requireAuth, resolveProfileMembership, requirePermission('viewActivity'), async (req: Request, res: Response) => {
  try {
    const notes = await prisma.caregiverNote.findMany({
      where: { profileId: req.profile!.id },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.json(notes);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * POST /api/profiles/:profileId/notes
 * Add a new caregiver note
 */
router.post('/', requireAuth, resolveProfileMembership, requirePermission('addNotes'), async (req: Request, res: Response) => {
  try {
    const data = createNoteSchema.parse(req.body);

    const note = await prisma.caregiverNote.create({
      data: {
        profileId: req.profile!.id,
        authorUserId: req.user!.id,
        note: data.note,
        isFlagged: data.isFlagged
      },
      include: {
        author: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        profileId: req.profile!.id,
        userId: req.user!.id,
        action: 'NOTE_CREATED',
        entityType: 'CaregiverNote',
        entityId: note.id,
        details: { isFlagged: data.isFlagged }
      }
    });

    // Notify owner and care network
    const recipients = new Set<string>();
    if (req.profile!.ownerUserId && req.profile!.ownerUserId !== req.user!.id) {
      recipients.add(req.profile!.ownerUserId);
    }

    const members = await prisma.careNetworkMember.findMany({
      where: {
        careNetwork: { profileId: req.profile!.id },
        status: 'ACTIVE',
        userId: { not: req.user!.id },
        viewActivity: true
      }
    });

    for (const m of members) {
      recipients.add(m.userId);
    }

    for (const recipientId of recipients) {
      await sendNotification({
        recipientId,
        profileId: req.profile!.id,
        type: 'CAREGIVER_ACTIVITY',
        title: data.isFlagged ? 'Important Caregiver Note' : 'New Caregiver Note',
        message: `${req.user!.name} added a note: "${data.note.slice(0, 80)}${data.note.length > 80 ? '...' : ''}"`,
        entityId: note.id,
        occurrenceKey: `NOTE:${note.id}`
      });
    }

    res.status(201).json(note);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return sendError(res, 400, 'VALIDATION_ERROR', err.errors[0].message);
    }
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * DELETE /api/profiles/:profileId/notes/:id
 * Delete a caregiver note (author or profile owner only)
 */
router.delete('/:id', requireAuth, resolveProfileMembership, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.caregiverNote.findFirst({
      where: { id: req.params.id, profileId: req.profile!.id }
    });

    if (!existing) {
      return sendError(res, 404, 'NOTE_NOT_FOUND', 'Note not found');
    }

    const isAuthor = existing.authorUserId === req.user!.id;
    const isOwner = req.membership?.role === 'OWNER';

    if (!isAuthor && !isOwner) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only delete notes you authored');
    }

    await prisma.caregiverNote.delete({
      where: { id: existing.id }
    });

    await prisma.auditLog.create({
      data: {
        profileId: req.profile!.id,
        userId: req.user!.id,
        action: 'NOTE_DELETED',
        entityType: 'CaregiverNote',
        entityId: existing.id
      }
    });

    res.json({ success: true, message: 'Note deleted' });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
