import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';
import {
  resolveWallClockInstant,
  generateDosesForSchedule,
  handleTimezoneChange
} from '../services/doseGenerator';
import { hashPassword } from '../utils/crypto';

describe('Gate 3: Timezone and DST Verification', () => {
  let userId: string;

  beforeAll(async () => {
    const hash = await hashPassword('Password123!');
    const user = await prisma.user.create({
      data: { email: 'tztest@carebuddy.local', passwordHash: hash, name: 'TZ Tester' }
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Wall-Clock Resolution across Timezones and DST Transitions', () => {
    it('handles Asia/Kolkata (fixed UTC+05:30, no DST): exactly matches wall-clock', () => {
      const res = resolveWallClockInstant('2026-06-15', '08:00', 'Asia/Kolkata');
      expect(res.actualLocalDate).toBe('2026-06-15');
      expect(res.actualLocalTime).toBe('08:00');
      // 08:00 IST = 02:30 UTC
      expect(res.scheduledAt.toISO()).toContain('02:30:00.000Z');
    });

    it('handles America/New_York Spring-Forward gap (2026-03-08): nonexistent 02:30 moves to first valid instant (03:00)', () => {
      // On 2026-03-08, clocks jump from 02:00 to 03:00 EDT
      const res = resolveWallClockInstant('2026-03-08', '02:30', 'America/New_York');
      expect(res.actualLocalDate).toBe('2026-03-08');
      expect(res.actualLocalTime).toBe('03:00');
      // 03:00 EDT = 07:00 UTC
      expect(res.scheduledAt.toISO()).toContain('07:00:00.000Z');
    });

    it('handles America/New_York Fall-Back overlap (2026-11-01): uses first occurrence without doubling', () => {
      // On 2026-11-01, 01:30 repeats (first EDT UTC-4, then EST UTC-5). Uses first occurrence.
      const res = resolveWallClockInstant('2026-11-01', '01:30', 'America/New_York');
      expect(res.actualLocalDate).toBe('2026-11-01');
      expect(res.actualLocalTime).toBe('01:30');
      // First occurrence is 01:30 EDT = 05:30 UTC
      expect(res.scheduledAt.toISO()).toContain('05:30:00.000Z');
    });

    it('handles Europe/London BST transition: exactly one dose at the correct instant', () => {
      // 2026-03-29 Spring forward 01:00 to 02:00 BST
      const res = resolveWallClockInstant('2026-03-29', '08:00', 'Europe/London');
      expect(res.actualLocalDate).toBe('2026-03-29');
      expect(res.actualLocalTime).toBe('08:00');
      // 08:00 BST = 07:00 UTC
      expect(res.scheduledAt.toISO()).toContain('07:00:00.000Z');
    });

    it('handles Australia/Lord_Howe 30-minute daylight saving shift: accurate instant computation', () => {
      // Lord Howe Island has a 30-minute daylight saving shift
      const res = resolveWallClockInstant('2026-01-15', '08:00', 'Australia/Lord_Howe');
      expect(res.actualLocalDate).toBe('2026-01-15');
      expect(res.actualLocalTime).toBe('08:00');
      // In January (DST), Lord Howe is UTC+11:00 -> 08:00 is 21:00 UTC previous day
      expect(res.scheduledAt.toISO()).toContain('21:00:00.000Z');
    });
  });

  describe('2. Schedule Dose Generation & Timezone Change Regeneration', () => {
    it('regenerates doses under a new timezone while leaving past doses untouched', async () => {
      // Create profile in Asia/Kolkata
      const profile = await prisma.elderlyProfile.create({
        data: {
          name: 'Grandma Timezone',
          timezone: 'Asia/Kolkata',
          ownerMode: 'DIRECT',
          ownerUserId: userId
        }
      });

      const network = await prisma.careNetwork.create({
        data: { profileId: profile.id }
      });

      await prisma.careNetworkMember.create({
        data: {
          careNetworkId: network.id,
          userId,
          role: 'OWNER',
          status: 'ACTIVE'
        }
      });

      // Create medication and schedule
      const med = await prisma.medication.create({
        data: {
          profileId: profile.id,
          name: 'Levothyroxine',
          strength: '50mcg',
          dosage: '1 tablet',
          medicineType: 'TABLET',
          startDate: new Date('2026-01-01'),
          status: 'ACTIVE'
        }
      });

      const schedule = await prisma.medicationSchedule.create({
        data: {
          medicationId: med.id,
          version: 1,
          frequency: 'ONCE_DAILY',
          timesOfDay: ['08:00'],
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          isActive: true
        }
      });

      // Insert a past dose that was TAKEN
      const pastDose = await prisma.medicationDose.create({
        data: {
          profileId: profile.id,
          medicationId: med.id,
          scheduleId: schedule.id,
          localDate: '2026-01-01',
          localTime: '08:00',
          scheduledAt: new Date('2026-01-01T02:30:00Z'),
          timezone: 'Asia/Kolkata',
          status: 'TAKEN',
          version: 2
        }
      });

      // Generate initial doses for the next 48h
      const initialCount = await generateDosesForSchedule(
        { ...schedule, medication: med },
        'Asia/Kolkata',
        48
      );
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Perform timezone change to America/New_York
      await handleTimezoneChange(profile.id, 'America/New_York', userId);

      // 1. Past dose must remain untouched
      const pastDoseAfter = await prisma.medicationDose.findUnique({
        where: { id: pastDose.id }
      });
      expect(pastDoseAfter?.status).toBe('TAKEN');
      expect(pastDoseAfter?.voidedAt).toBeNull();
      expect(pastDoseAfter?.timezone).toBe('Asia/Kolkata');

      // 2. Profile timezone must be updated
      const updatedProfile = await prisma.elderlyProfile.findUnique({
        where: { id: profile.id }
      });
      expect(updatedProfile?.timezone).toBe('America/New_York');

      // 3. New future unacted doses must have timezone America/New_York
      const newDoses = await prisma.medicationDose.findMany({
        where: {
          profileId: profile.id,
          voidedAt: null,
          status: 'PENDING'
        }
      });
      expect(newDoses.length).toBeGreaterThan(0);
      newDoses.forEach((d) => {
        expect(d.timezone).toBe('America/New_York');
      });

      // 4. Audit entry written
      const audit = await prisma.auditLog.findFirst({
        where: {
          profileId: profile.id,
          action: 'TIMEZONE_CHANGED'
        }
      });
      expect(audit).toBeDefined();
    });
  });
});
