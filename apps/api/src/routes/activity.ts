import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requirePermission } from '../middleware/profile';
import { sendError } from '../utils/errors';

const router = Router({ mergeParams: true });

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

export interface ActivityTimelineItem {
  id: string;
  type: 'DOSE' | 'APPOINTMENT' | 'NOTE' | 'CARE_NETWORK';
  action: string;
  title: string;
  description: string;
  actorName?: string;
  timestamp: Date;
  metadata?: any;
}

/**
 * GET /api/profiles/:profileId/activity
 * Aggregated shared activity timeline for the care network
 * Excludes sensitive owner-only audit details (IP, user-agent, session events)
 */
router.get('/', requireAuth, resolveProfileMembership, requirePermission('viewActivity'), async (req: Request, res: Response) => {
  try {
    const { limit, offset } = querySchema.parse(req.query);
    const profileId = req.profile!.id;

    // Fetch parallel activity streams
    const [doseLogs, appointments, notes, auditCareNetwork] = await Promise.all([
      // 1. Dose logs
      prisma.medicationLog.findMany({
        where: { profileId },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
          medication: { select: { name: true, dosage: true } },
          dose: { select: { localDate: true, localTime: true } }
        }
      }),

      // 2. Appointments
      prisma.appointment.findMany({
        where: { profileId },
        orderBy: { updatedAt: 'desc' },
        take: limit
      }),

      // 3. Caregiver notes
      prisma.caregiverNote.findMany({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          author: { select: { id: true, name: true } }
        }
      }),

      // 4. Non-sensitive network audit events (member joined/removed)
      prisma.auditLog.findMany({
        where: {
          profileId,
          action: { in: ['MEMBER_JOINED', 'MEMBER_REMOVED', 'ROLE_CHANGED', 'PERMISSION_UPDATED'] }
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
          user: { select: { name: true } }
        }
      })
    ]);

    // Format dose items
    const doseItems: ActivityTimelineItem[] = doseLogs.map((log) => {
      let actionTitle = `Dose ${log.action.toLowerCase()}`;
      if (log.action === 'TAKEN') actionTitle = 'Medication taken';
      else if (log.action === 'SKIPPED') actionTitle = 'Dose skipped';
      else if (log.action === 'SNOOZED') actionTitle = 'Dose snoozed';
      else if (log.action === 'MISSED') actionTitle = 'Dose missed';

      const medName = log.medication?.name || 'Medication';
      const dosage = log.medication?.dosage || '';
      const localTime = log.dose?.localTime || '';

      return {
        id: `dose-${log.id}`,
        type: 'DOSE',
        action: log.action,
        title: `${actionTitle}: ${medName} ${dosage}`.trim(),
        description: log.reason ? `Reason: ${log.reason}` : `Scheduled for ${localTime}`,
        actorName: log.actionSource === 'SYSTEM_WORKER' ? 'CareBuddy Worker' : undefined,
        timestamp: log.timestamp,
        metadata: {
          doseId: log.doseId,
          medicationId: log.medicationId,
          actionSource: log.actionSource,
          actedOnBehalf: log.actedOnBehalf
        }
      };
    });

    // Format appointment items
    const appointmentItems: ActivityTimelineItem[] = appointments.map((apt) => ({
      id: `apt-${apt.id}`,
      type: 'APPOINTMENT',
      action: apt.status,
      title: `Appointment with ${apt.doctor}`,
      description: `${apt.clinic} on ${apt.localDate} at ${apt.localTime} (${apt.status.toLowerCase()})`,
      timestamp: apt.updatedAt,
      metadata: {
        appointmentId: apt.id,
        status: apt.status,
        specialty: apt.specialty
      }
    }));

    // Format note items
    const noteItems: ActivityTimelineItem[] = notes.map((note) => ({
      id: `note-${note.id}`,
      type: 'NOTE',
      action: note.isFlagged ? 'FLAGGED_NOTE' : 'NOTE_ADDED',
      title: note.isFlagged ? 'Important Caregiver Note' : 'Caregiver Note Added',
      description: note.note,
      actorName: note.author.name,
      timestamp: note.createdAt,
      metadata: {
        noteId: note.id,
        isFlagged: note.isFlagged
      }
    }));

    // Format network items
    const networkItems: ActivityTimelineItem[] = auditCareNetwork.map((audit) => ({
      id: `audit-${audit.id}`,
      type: 'CARE_NETWORK',
      action: audit.action,
      title: `Care Network: ${audit.action.replace('_', ' ').toLowerCase()}`,
      description: typeof audit.details === 'object' && audit.details !== null ? JSON.stringify(audit.details) : '',
      actorName: audit.user?.name,
      timestamp: audit.timestamp
    }));

    // Combine and sort chronologically descending
    const combined = [...doseItems, ...appointmentItems, ...noteItems, ...networkItems].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    const paginated = combined.slice(offset, offset + limit);

    res.json({
      activity: paginated,
      totalCount: combined.length,
      limit,
      offset
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
