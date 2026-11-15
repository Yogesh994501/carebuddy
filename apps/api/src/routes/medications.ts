import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { resolveProfileMembership, requirePermission } from '../middleware/profile';
import { sendError } from '../utils/errors';
import { generateDosesForSchedule } from '../services/doseGenerator';
import { scheduleJobsForUpcomingDoses } from '../services/jobHandlers';
import { ScheduleFrequency } from '@prisma/client';

const router = Router({ mergeParams: true });

const createMedicationSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  genericName: z.string().optional(),
  strength: z.string().min(1, 'Strength is required').trim(),
  dosage: z.string().min(1, 'Dosage is required').trim(),
  medicineType: z.string().default('TABLET'),
  prescriptionDetails: z.string().optional(),
  prescriber: z.string().optional(),
  instructions: z.string().optional(),
  foodInstructions: z.string().optional(),
  refillQuantity: z.number().int().positive().optional(),
  refillReminderThreshold: z.number().int().positive().optional(),
  currentPillsRemaining: z.number().int().nonnegative().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  confirmedPrescriptionSource: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm that directions come from the prescriber or medicine label.' })
  }),
  // Schedule
  frequency: z.enum([
    'ONCE_DAILY',
    'TWICE_DAILY',
    'THREE_TIMES_DAILY',
    'CUSTOM_TIMES',
    'SELECTED_WEEKDAYS'
  ]),
  timesOfDay: z.array(z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM')).min(1),
  weekdays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6, 7])
});

const updateMedicationSchema = z.object({
  name: z.string().min(1).optional(),
  genericName: z.string().optional(),
  strength: z.string().min(1).optional(),
  dosage: z.string().min(1).optional(),
  medicineType: z.string().optional(),
  prescriptionDetails: z.string().optional(),
  prescriber: z.string().optional(),
  instructions: z.string().optional(),
  foodInstructions: z.string().optional(),
  refillQuantity: z.number().int().positive().optional(),
  refillReminderThreshold: z.number().int().positive().optional(),
  currentPillsRemaining: z.number().int().nonnegative().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // Schedule edit
  frequency: z.enum([
    'ONCE_DAILY',
    'TWICE_DAILY',
    'THREE_TIMES_DAILY',
    'CUSTOM_TIMES',
    'SELECTED_WEEKDAYS'
  ]).optional(),
  timesOfDay: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional()
});

/**
 * GET /api/profiles/:profileId/medications
 * Lists medications with active schedule versions
 */
router.get('/', requireAuth, resolveProfileMembership, requirePermission('viewMedications'), async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;

    const where: any = {
      profileId: req.profile!.id,
      deletedAt: null
    };

    if (status) {
      where.status = status;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const medications = await prisma.medication.findMany({
      where,
      include: {
        schedules: {
          where: { isActive: true },
          orderBy: { version: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ medications });
  } catch (error) {
    console.error('List medications error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/profiles/:profileId/medications
 * Creates medication and schedule version 1, generates future 48h doses
 */
router.post('/', requireAuth, resolveProfileMembership, requirePermission('manageMedications'), async (req: Request, res: Response) => {
  try {
    const parseResult = createMedicationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const data = parseResult.data;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create medication
      const med = await tx.medication.create({
        data: {
          profileId: req.profile!.id,
          name: data.name,
          genericName: data.genericName,
          strength: data.strength,
          dosage: data.dosage,
          medicineType: data.medicineType,
          prescriptionDetails: data.prescriptionDetails,
          prescriber: data.prescriber,
          instructions: data.instructions,
          foodInstructions: data.foodInstructions,
          refillQuantity: data.refillQuantity,
          refillReminderThreshold: data.refillReminderThreshold,
          currentPillsRemaining: data.currentPillsRemaining ?? data.refillQuantity,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          confirmedPrescriptionSource: true,
          status: 'ACTIVE'
        }
      });

      // 2. Create Schedule version 1
      const schedule = await tx.medicationSchedule.create({
        data: {
          medicationId: med.id,
          version: 1,
          frequency: data.frequency,
          timesOfDay: data.timesOfDay,
          weekdays: data.weekdays,
          effectiveFrom: now,
          isActive: true
        }
      });

      // 3. AuditLog
      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'MEDICATION_CREATED',
          entityType: 'Medication',
          entityId: med.id,
          details: { name: med.name, dosage: med.dosage, frequency: schedule.frequency },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return { med, schedule };
    });

    // 4. Generate doses for the next 48 hours
    await generateDosesForSchedule(
      { ...result.schedule, medication: result.med },
      req.profile!.timezone
    );
    await scheduleJobsForUpcomingDoses(req.profile!.id);

    return res.status(201).json({
      medication: result.med,
      schedule: result.schedule
    });
  } catch (error) {
    console.error('Create medication error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * GET /api/profiles/:profileId/medications/:id
 * Fetches medication detail with versioned schedules and recent doses
 */
router.get('/:id', requireAuth, resolveProfileMembership, requirePermission('viewMedications'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const medication = await prisma.medication.findFirst({
      where: {
        id,
        profileId: req.profile!.id,
        deletedAt: null
      },
      include: {
        schedules: {
          orderBy: { version: 'desc' }
        },
        doses: {
          orderBy: { scheduledAt: 'desc' },
          take: 30
        }
      }
    });

    if (!medication) {
      return sendError(res, 404, 'MEDICATION_NOT_FOUND', 'Medication not found.');
    }

    return res.json({ medication });
  } catch (error) {
    console.error('Get medication error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * PATCH /api/profiles/:profileId/medications/:id
 * Updates medication; creates new schedule version if times or frequency change
 */
router.patch('/:id', requireAuth, resolveProfileMembership, requirePermission('manageMedications'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = updateMedicationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parseResult.error.errors[0].message);
    }

    const data = parseResult.data;
    const existing = await prisma.medication.findFirst({
      where: { id, profileId: req.profile!.id, deletedAt: null },
      include: {
        schedules: {
          where: { isActive: true },
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    if (!existing) {
      return sendError(res, 404, 'MEDICATION_NOT_FOUND', 'Medication not found.');
    }

    const now = new Date();
    const currentSchedule = existing.schedules[0];

    const isScheduleChanged =
      (data.frequency && data.frequency !== currentSchedule?.frequency) ||
      (data.timesOfDay && JSON.stringify(data.timesOfDay) !== JSON.stringify(currentSchedule?.timesOfDay)) ||
      (data.weekdays && JSON.stringify(data.weekdays) !== JSON.stringify(currentSchedule?.weekdays));

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update medication fields
      const updatedMed = await tx.medication.update({
        where: { id },
        data: {
          name: data.name,
          genericName: data.genericName,
          strength: data.strength,
          dosage: data.dosage,
          medicineType: data.medicineType,
          prescriptionDetails: data.prescriptionDetails,
          prescriber: data.prescriber,
          instructions: data.instructions,
          foodInstructions: data.foodInstructions,
          refillQuantity: data.refillQuantity,
          refillReminderThreshold: data.refillReminderThreshold,
          currentPillsRemaining: data.currentPillsRemaining,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : undefined
        }
      });

      let newSchedule = currentSchedule;

      if (isScheduleChanged && currentSchedule) {
        // Deactivate old schedule
        await tx.medicationSchedule.update({
          where: { id: currentSchedule.id },
          data: {
            isActive: false,
            effectiveTo: now
          }
        });

        // Void future unacted doses of old schedule
        await tx.medicationDose.updateMany({
          where: {
            scheduleId: currentSchedule.id,
            status: { in: ['PENDING', 'SNOOZED'] },
            scheduledAt: { gt: now },
            voidedAt: null
          },
          data: {
            voidedAt: now
          }
        });

        // Create new schedule version
        newSchedule = await tx.medicationSchedule.create({
          data: {
            medicationId: id,
            version: currentSchedule.version + 1,
            frequency: data.frequency || currentSchedule.frequency,
            timesOfDay: data.timesOfDay || currentSchedule.timesOfDay,
            weekdays: data.weekdays || currentSchedule.weekdays,
            effectiveFrom: now,
            isActive: true
          }
        });
      }

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'MEDICATION_UPDATED',
          entityType: 'Medication',
          entityId: id,
          details: { updates: data, scheduleVersion: newSchedule?.version },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return { updatedMed, newSchedule, isScheduleChanged };
    });

    // If schedule changed, generate doses for new version
    if (result.isScheduleChanged && result.newSchedule) {
      await generateDosesForSchedule(
        { ...result.newSchedule, medication: result.updatedMed },
        req.profile!.timezone
      );
      await scheduleJobsForUpcomingDoses(req.profile!.id);
    }

    return res.json({
      medication: result.updatedMed,
      schedule: result.newSchedule
    });
  } catch (error) {
    console.error('Update medication error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/profiles/:profileId/medications/:id/pause
 * Sets status PAUSED, voids future unacted doses
 */
router.post('/:id/pause', requireAuth, resolveProfileMembership, requirePermission('manageMedications'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const med = await prisma.$transaction(async (tx) => {
      const updated = await tx.medication.update({
        where: { id },
        data: { status: 'PAUSED' }
      });

      // Void future unacted doses
      await tx.medicationDose.updateMany({
        where: {
          medicationId: id,
          status: { in: ['PENDING', 'SNOOZED'] },
          scheduledAt: { gt: now },
          voidedAt: null
        },
        data: { voidedAt: now }
      });

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'MEDICATION_PAUSED',
          entityType: 'Medication',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return updated;
    });

    return res.json({ medication: med });
  } catch (error) {
    console.error('Pause medication error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/profiles/:profileId/medications/:id/resume
 * Sets status ACTIVE, regenerates future doses
 */
router.post('/:id/resume', requireAuth, resolveProfileMembership, requirePermission('manageMedications'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const med = await prisma.$transaction(async (tx) => {
      const updated = await tx.medication.update({
        where: { id },
        data: { status: 'ACTIVE' }
      });

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'MEDICATION_RESUMED',
          entityType: 'Medication',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return updated;
    });

    const activeSchedule = await prisma.medicationSchedule.findFirst({
      where: { medicationId: id, isActive: true },
      orderBy: { version: 'desc' }
    });

    if (activeSchedule) {
      await generateDosesForSchedule(
        { ...activeSchedule, medication: med },
        req.profile!.timezone
      );
    }

    return res.json({ medication: med });
  } catch (error) {
    console.error('Resume medication error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * POST /api/profiles/:profileId/medications/:id/discontinue
 * Sets status DISCONTINUED, voids future unacted doses
 */
router.post('/:id/discontinue', requireAuth, resolveProfileMembership, requirePermission('manageMedications'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const med = await prisma.$transaction(async (tx) => {
      const updated = await tx.medication.update({
        where: { id },
        data: { status: 'DISCONTINUED' }
      });

      await tx.medicationDose.updateMany({
        where: {
          medicationId: id,
          status: { in: ['PENDING', 'SNOOZED'] },
          scheduledAt: { gt: now },
          voidedAt: null
        },
        data: { voidedAt: now }
      });

      await tx.auditLog.create({
        data: {
          profileId: req.profile!.id,
          userId: req.user!.id,
          action: 'MEDICATION_DISCONTINUED',
          entityType: 'Medication',
          entityId: id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      });

      return updated;
    });

    return res.json({ medication: med });
  } catch (error) {
    console.error('Discontinue medication error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

/**
 * DELETE /api/profiles/:profileId/medications/:id
 * Soft deletes if doses exist; hard delete only if 0 doses exist.
 */
router.delete('/:id', requireAuth, resolveProfileMembership, requirePermission('manageMedications'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const doseCount = await prisma.medicationDose.count({
      where: { medicationId: id }
    });

    if (doseCount > 0) {
      // Soft delete
      await prisma.$transaction(async (tx) => {
        await tx.medication.update({
          where: { id },
          data: { deletedAt: now, status: 'DISCONTINUED' }
        });

        // Void future unacted doses
        await tx.medicationDose.updateMany({
          where: {
            medicationId: id,
            status: { in: ['PENDING', 'SNOOZED'] },
            scheduledAt: { gt: now },
            voidedAt: null
          },
          data: { voidedAt: now }
        });

        await tx.auditLog.create({
          data: {
            profileId: req.profile!.id,
            userId: req.user!.id,
            action: 'MEDICATION_SOFT_DELETED',
            entityType: 'Medication',
            entityId: id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          }
        });
      });

      return res.json({ success: true, mode: 'soft-delete' });
    } else {
      // Hard delete allowed only with 0 doses
      await prisma.medication.delete({ where: { id } });
      return res.json({ success: true, mode: 'hard-delete' });
    }
  } catch (error) {
    console.error('Delete medication error:', error);
    return sendError(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
  }
});

export default router;
