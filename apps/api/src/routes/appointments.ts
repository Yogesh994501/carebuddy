import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requirePermission } from '../middleware/profile';
import { sendError } from '../utils/errors';
import { resolveWallClockInstant } from '../services/doseGenerator';
import { enqueueJob } from '../services/jobQueue';
import { sendNotification } from '../services/notificationService';

const router = Router({ mergeParams: true });

// Validation schemas
const createAppointmentSchema = z.object({
  doctor: z.string().min(1, 'Doctor name is required').trim(),
  specialty: z.string().optional(),
  clinic: z.string().min(1, 'Clinic or facility is required').trim(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  localTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  address: z.string().optional(),
  contact: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional()
});

const updateAppointmentSchema = z.object({
  doctor: z.string().min(1).optional(),
  specialty: z.string().optional(),
  clinic: z.string().min(1).optional(),
  address: z.string().optional(),
  contact: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional()
});

const rescheduleAppointmentSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  localTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  reason: z.string().optional()
});

/**
 * Schedule 24h and 2h reminder background jobs for an appointment
 */
async function scheduleAppointmentReminders(
  appointmentId: string,
  profileId: string,
  scheduledAt: Date
) {
  const scheduledTimeMs = scheduledAt.getTime();

  // 1. 24-hour reminder job
  const runAt24h = new Date(scheduledTimeMs - 24 * 60 * 60 * 1000);
  await enqueueJob({
    profileId,
    type: 'APPOINTMENT_REMINDER',
    runAt: runAt24h,
    idempotencyKey: `APPOINTMENT_REMINDER:${appointmentId}:24H`,
    payload: { appointmentId, reminderType: '24H' }
  });

  // 2. 2-hour reminder job
  const runAt2h = new Date(scheduledTimeMs - 2 * 60 * 60 * 1000);
  await enqueueJob({
    profileId,
    type: 'APPOINTMENT_REMINDER',
    runAt: runAt2h,
    idempotencyKey: `APPOINTMENT_REMINDER:${appointmentId}:2H`,
    payload: { appointmentId, reminderType: '2H' }
  });
}

/**
 * Cancel pending reminder background jobs for an appointment
 */
async function cancelAppointmentReminders(appointmentId: string) {
  await prisma.scheduledJob.updateMany({
    where: {
      idempotencyKey: { in: [`APPOINTMENT_REMINDER:${appointmentId}:24H`, `APPOINTMENT_REMINDER:${appointmentId}:2H`] },
      status: 'QUEUED'
    },
    data: {
      status: 'EXPIRED',
      lastError: 'Appointment rescheduled or cancelled'
    }
  });
}

/**
 * GET /api/profiles/:profileId/appointments
 * List appointments for the profile (ordered chronologically)
 */
router.get('/', requireAuth, resolveProfileMembership, requirePermission('viewAppointments'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;

    const where: any = { profileId: req.profile!.id };
    if (status && ['SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      where.status = status;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' }
    });

    res.json(appointments);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * GET /api/profiles/:profileId/appointments/:id
 * Retrieve a specific appointment
 */
router.get('/:id', requireAuth, resolveProfileMembership, requirePermission('viewAppointments'), async (req: Request, res: Response) => {
  try {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: req.params.id,
        profileId: req.profile!.id
      }
    });

    if (!appointment) {
      return sendError(res, 404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    res.json(appointment);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * POST /api/profiles/:profileId/appointments
 * Create a new appointment and schedule background reminders
 */
router.post('/', requireAuth, resolveProfileMembership, requirePermission('manageAppointments'), async (req: Request, res: Response) => {
  try {
    const data = createAppointmentSchema.parse(req.body);

    const timezone = req.profile!.timezone;
    const { scheduledAt } = resolveWallClockInstant(data.localDate, data.localTime, timezone);

    const appointment = await prisma.appointment.create({
      data: {
        profileId: req.profile!.id,
        doctor: data.doctor,
        specialty: data.specialty,
        clinic: data.clinic,
        scheduledAt: scheduledAt.toJSDate(),
        localDate: data.localDate,
        localTime: data.localTime,
        address: data.address,
        contact: data.contact,
        reason: data.reason,
        notes: data.notes,
        status: 'SCHEDULED',
        createdById: req.user!.id
      }
    });

    // Schedule 24h & 2h background reminder jobs
    await scheduleAppointmentReminders(appointment.id, req.profile!.id, appointment.scheduledAt);

    // Audit log
    await prisma.auditLog.create({
      data: {
        profileId: req.profile!.id,
        userId: req.user!.id,
        action: 'APPOINTMENT_CREATED',
        entityType: 'Appointment',
        entityId: appointment.id,
        details: { doctor: data.doctor, clinic: data.clinic, scheduledAt: appointment.scheduledAt }
      }
    });

    res.status(201).json(appointment);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return sendError(res, 400, 'VALIDATION_ERROR', err.errors[0].message);
    }
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * PATCH /api/profiles/:profileId/appointments/:id
 * Update appointment details (non-scheduling fields)
 */
router.patch('/:id', requireAuth, resolveProfileMembership, requirePermission('manageAppointments'), async (req: Request, res: Response) => {
  try {
    const data = updateAppointmentSchema.parse(req.body);

    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, profileId: req.profile!.id }
    });

    if (!existing) {
      return sendError(res, 404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data
    });

    await prisma.auditLog.create({
      data: {
        profileId: req.profile!.id,
        userId: req.user!.id,
        action: 'APPOINTMENT_UPDATED',
        entityType: 'Appointment',
        entityId: updated.id,
        details: { updates: data }
      }
    });

    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return sendError(res, 400, 'VALIDATION_ERROR', err.errors[0].message);
    }
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * POST /api/profiles/:profileId/appointments/:id/reschedule
 * Reschedule appointment, record previous time, update reminder jobs and notify care network
 */
router.post('/:id/reschedule', requireAuth, resolveProfileMembership, requirePermission('manageAppointments'), async (req: Request, res: Response) => {
  try {
    const data = rescheduleAppointmentSchema.parse(req.body);

    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, profileId: req.profile!.id }
    });

    if (!existing) {
      return sendError(res, 404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const timezone = req.profile!.timezone;
    const { scheduledAt } = resolveWallClockInstant(data.localDate, data.localTime, timezone);

    // Cancel old reminder jobs
    await cancelAppointmentReminders(existing.id);

    // Update appointment
    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: {
        scheduledAt: scheduledAt.toJSDate(),
        localDate: data.localDate,
        localTime: data.localTime,
        rescheduledFrom: existing.scheduledAt,
        status: 'SCHEDULED'
      }
    });

    // Re-schedule reminder jobs for new date/time
    await scheduleAppointmentReminders(updated.id, req.profile!.id, updated.scheduledAt);

    // Audit log
    await prisma.auditLog.create({
      data: {
        profileId: req.profile!.id,
        userId: req.user!.id,
        action: 'APPOINTMENT_RESCHEDULED',
        entityType: 'Appointment',
        entityId: updated.id,
        details: {
          previousScheduledAt: existing.scheduledAt,
          newScheduledAt: updated.scheduledAt,
          reason: data.reason
        }
      }
    });

    // Notify care network
    const members = await prisma.careNetworkMember.findMany({
      where: {
        careNetwork: { profileId: req.profile!.id },
        status: 'ACTIVE',
        viewAppointments: true
      }
    });

    for (const member of members) {
      await sendNotification({
        recipientId: member.userId,
        profileId: req.profile!.id,
        type: 'APPOINTMENT_CHANGED',
        title: 'Appointment Rescheduled',
        message: `Appointment with ${updated.doctor} was rescheduled to ${updated.localDate} at ${updated.localTime}.`,
        entityId: updated.id,
        occurrenceKey: `RESCHEDULE:${updated.id}:${updated.scheduledAt.getTime()}`
      });
    }

    res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return sendError(res, 400, 'VALIDATION_ERROR', err.errors[0].message);
    }
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * POST /api/profiles/:profileId/appointments/:id/cancel
 * Cancel appointment, expire reminder jobs, and notify care network
 */
router.post('/:id/cancel', requireAuth, resolveProfileMembership, requirePermission('manageAppointments'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, profileId: req.profile!.id }
    });

    if (!existing) {
      return sendError(res, 404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' }
    });

    // Cancel pending reminders
    await cancelAppointmentReminders(existing.id);

    // Audit log
    await prisma.auditLog.create({
      data: {
        profileId: req.profile!.id,
        userId: req.user!.id,
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'Appointment',
        entityId: updated.id,
        details: { reason: req.body?.reason }
      }
    });

    // Notify care network
    const members = await prisma.careNetworkMember.findMany({
      where: {
        careNetwork: { profileId: req.profile!.id },
        status: 'ACTIVE',
        viewAppointments: true
      }
    });

    for (const member of members) {
      await sendNotification({
        recipientId: member.userId,
        profileId: req.profile!.id,
        type: 'APPOINTMENT_CHANGED',
        title: 'Appointment Cancelled',
        message: `Appointment with ${updated.doctor} at ${updated.clinic} on ${updated.localDate} was cancelled.`,
        entityId: updated.id,
        occurrenceKey: `CANCEL:${updated.id}`
      });
    }

    res.json(updated);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

/**
 * POST /api/profiles/:profileId/appointments/:id/complete
 * Mark appointment as completed
 */
router.post('/:id/complete', requireAuth, resolveProfileMembership, requirePermission('manageAppointments'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, profileId: req.profile!.id }
    });

    if (!existing) {
      return sendError(res, 404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: { status: 'COMPLETED' }
    });

    // Cancel pending reminders
    await cancelAppointmentReminders(existing.id);

    await prisma.auditLog.create({
      data: {
        profileId: req.profile!.id,
        userId: req.user!.id,
        action: 'APPOINTMENT_COMPLETED',
        entityType: 'Appointment',
        entityId: updated.id
      }
    });

    res.json(updated);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
