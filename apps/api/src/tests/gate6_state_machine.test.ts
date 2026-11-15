import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../db/prisma';
import { transitionDose } from '../services/doseStateMachine';
import { calculateAdherence } from '../services/adherence';
import { hashPassword } from '../utils/crypto';
import { DateTime } from 'luxon';

describe('Gate 6 (Transition Half): MISSED never equals TAKEN & State Machine Invariants', () => {
  let userId: string;
  let profileId: string;
  let medicationId: string;
  let scheduleId: string;

  beforeAll(async () => {
    const hash = await hashPassword('Password123!');
    const user = await prisma.user.create({
      data: { email: 'gate6@carebuddy.local', passwordHash: hash, name: 'Gate6 Tester' }
    });
    userId = user.id;

    const profile = await prisma.elderlyProfile.create({
      data: {
        name: 'Grandma Invariants',
        timezone: 'Asia/Kolkata',
        overdueGraceMinutes: 60,
        snoozeDurationMinutes: 10,
        maxSnoozeCount: 3,
        ownerUserId: userId
      }
    });
    profileId = profile.id;

    const med = await prisma.medication.create({
      data: {
        profileId,
        name: 'Atorvastatin',
        strength: '20mg',
        dosage: '1 tablet',
        medicineType: 'TABLET',
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE',
        refillQuantity: 30,
        currentPillsRemaining: 30
      }
    });
    medicationId = med.id;

    const schedule = await prisma.medicationSchedule.create({
      data: {
        medicationId,
        version: 1,
        frequency: 'ONCE_DAILY',
        timesOfDay: ['08:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        isActive: true
      }
    });
    scheduleId = schedule.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Snoozing a dose never sets status = TAKEN; snoozedUntil is set and snoozeCount increments', async () => {
    const dose = await prisma.medicationDose.create({
      data: {
        profileId,
        medicationId,
        scheduleId,
        localDate: '2026-11-15',
        localTime: '08:00',
        scheduledAt: new Date(),
        timezone: 'Asia/Kolkata',
        status: 'PENDING'
      }
    });

    const result = await transitionDose({
      doseId: dose.id,
      targetState: 'SNOOZED',
      actorUserId: userId,
      actionSource: 'OWNER_APP'
    });

    expect(result.success).toBe(true);
    expect(result.dose.status).toBe('SNOOZED');
    expect(result.dose.status).not.toBe('TAKEN');
    expect(result.dose.snoozeCount).toBe(1);
    expect(result.dose.snoozedUntil).toBeDefined();

    // Verify scheduledAt remains completely unchanged (MISSED deadline is never shifted)
    expect(result.dose.scheduledAt.getTime()).toBe(dose.scheduledAt.getTime());
  });

  it('2. Enforces maximum snooze limit (maxSnoozeCount = 3)', async () => {
    const dose = await prisma.medicationDose.create({
      data: {
        profileId,
        medicationId,
        scheduleId,
        localDate: '2026-11-15',
        localTime: '12:00',
        scheduledAt: new Date(),
        timezone: 'Asia/Kolkata',
        status: 'PENDING'
      }
    });

    // Snooze 1
    await transitionDose({ doseId: dose.id, targetState: 'SNOOZED', actorUserId: userId, actionSource: 'OWNER_APP' });
    // Snooze 2
    await transitionDose({ doseId: dose.id, targetState: 'SNOOZED', actorUserId: userId, actionSource: 'OWNER_APP' });
    // Snooze 3
    await transitionDose({ doseId: dose.id, targetState: 'SNOOZED', actorUserId: userId, actionSource: 'OWNER_APP' });

    // Snooze 4 must throw an error
    await expect(
      transitionDose({ doseId: dose.id, targetState: 'SNOOZED', actorUserId: userId, actionSource: 'OWNER_APP' })
    ).rejects.toThrow(/Maximum snooze limit/);
  });

  it('3. MISSED status can only be set by SYSTEM_WORKER (rejects client apps)', async () => {
    const dose = await prisma.medicationDose.create({
      data: {
        profileId,
        medicationId,
        scheduleId,
        localDate: '2026-11-15',
        localTime: '14:00',
        scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        timezone: 'Asia/Kolkata',
        status: 'PENDING'
      }
    });

    // Client action source OWNER_APP attempting to set MISSED -> REJECTED
    await expect(
      transitionDose({
        doseId: dose.id,
        targetState: 'MISSED',
        actorUserId: userId,
        actionSource: 'OWNER_APP'
      })
    ).rejects.toThrow(/Only the background system worker can mark doses as MISSED/);

    // SYSTEM_WORKER -> ALLOWED
    const workerResult = await transitionDose({
      doseId: dose.id,
      targetState: 'MISSED',
      actorUserId: userId,
      actionSource: 'SYSTEM_WORKER'
    });
    expect(workerResult.success).toBe(true);
    expect(workerResult.dose.status).toBe('MISSED');
  });

  it('4. Correcting a MISSED dose to TAKEN preserves the original MISSED in history and marks correction', async () => {
    const dose = await prisma.medicationDose.create({
      data: {
        profileId,
        medicationId,
        scheduleId,
        localDate: '2026-11-14',
        localTime: '08:00',
        scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        timezone: 'Asia/Kolkata',
        status: 'PENDING'
      }
    });

    // Mark MISSED by worker
    await transitionDose({
      doseId: dose.id,
      targetState: 'MISSED',
      actorUserId: userId,
      actionSource: 'SYSTEM_WORKER'
    });

    // Correct to TAKEN with reason
    const correctResult = await transitionDose({
      doseId: dose.id,
      targetState: 'TAKEN',
      actorUserId: userId,
      actionSource: 'CORRECTION',
      reason: 'Took on time with breakfast, recorded late in app.',
      isCorrection: true
    });

    expect(correctResult.success).toBe(true);
    expect(correctResult.dose.status).toBe('TAKEN');
    expect(correctResult.dose.correctionReason).toBe('Took on time with breakfast, recorded late in app.');

    // Query MedicationLog trail: must have both MISSED and TAKEN entries
    const logs = await prisma.medicationLog.findMany({
      where: { doseId: dose.id },
      orderBy: { timestamp: 'asc' }
    });

    expect(logs.length).toBe(2);
    expect(logs[0].action).toBe('MISSED');
    expect(logs[0].actionSource).toBe('SYSTEM_WORKER');
    expect(logs[1].action).toBe('TAKEN');
    expect(logs[1].actionSource).toBe('CORRECTION');
    expect(logs[1].reason).toBe('Took on time with breakfast, recorded late in app.');
  });

  it('5. Adherence calculation excludes PENDING and SNOOZED doses still inside grace period', async () => {
    // Create dedicated profile for adherence calculation test
    const adhProfile = await prisma.elderlyProfile.create({
      data: {
        name: 'Adherence Profile',
        timezone: 'Asia/Kolkata',
        overdueGraceMinutes: 60,
        ownerUserId: userId
      }
    });

    const adhMed = await prisma.medication.create({
      data: {
        profileId: adhProfile.id,
        name: 'Adherence Med',
        strength: '10mg',
        dosage: '1 tablet',
        medicineType: 'TABLET',
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE'
      }
    });

    const adhSchedule = await prisma.medicationSchedule.create({
      data: {
        medicationId: adhMed.id,
        version: 1,
        frequency: 'ONCE_DAILY',
        timesOfDay: ['08:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        isActive: true
      }
    });

    // Dose 1: Past grace period, marked TAKEN
    await prisma.medicationDose.create({
      data: {
        profileId: adhProfile.id,
        medicationId: adhMed.id,
        scheduleId: adhSchedule.id,
        localDate: '2026-11-13',
        localTime: '08:00',
        scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        timezone: 'Asia/Kolkata',
        status: 'TAKEN'
      }
    });

    // Dose 2: Inside grace period (scheduled 10m ago), status PENDING
    await prisma.medicationDose.create({
      data: {
        profileId: adhProfile.id,
        medicationId: adhMed.id,
        scheduleId: adhSchedule.id,
        localDate: '2026-11-15',
        localTime: '08:00',
        scheduledAt: new Date(Date.now() - 10 * 60 * 1000),
        timezone: 'Asia/Kolkata',
        status: 'PENDING'
      }
    });

    // Dose 3: Inside grace period, status SNOOZED (different slot)
    await prisma.medicationDose.create({
      data: {
        profileId: adhProfile.id,
        medicationId: adhMed.id,
        scheduleId: adhSchedule.id,
        localDate: '2026-11-15',
        localTime: '12:00',
        scheduledAt: new Date(Date.now() - 5 * 60 * 1000),
        timezone: 'Asia/Kolkata',
        status: 'SNOOZED',
        snoozeCount: 1
      }
    });

    // Calculate 7-day adherence
    const report = await calculateAdherence(adhProfile.id, '7d');

    // Only Dose 1 is eligible! Doses 2 & 3 must be excluded from adherence denominator
    expect(report.overall.totalEligible).toBe(1);
    expect(report.overall.taken).toBe(1);
    expect(report.overall.skipped).toBe(0);
    expect(report.overall.missed).toBe(0);
    expect(report.overall.percentage).toBe(100);
  });
});
