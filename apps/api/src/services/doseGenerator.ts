import { DateTime, IANAZone } from 'luxon';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { MedicationSchedule, Medication } from '@prisma/client';

export interface GenerateDosesOptions {
  profileId: string;
  horizonHours?: number; // default 48h
  fromInstant?: DateTime;
}

/**
 * Resolves a wall-clock date and time in a given IANA timezone to a valid UTC instant,
 * handling DST transitions (spring forward gap and fall back overlap) per Section 6.
 */
export function resolveWallClockInstant(
  localDate: string, // "YYYY-MM-DD"
  localTime: string, // "HH:MM"
  zone: string
): { scheduledAt: DateTime; actualLocalDate: string; actualLocalTime: string } {
  const [yearStr, monthStr, dayStr] = localDate.split('-');
  const [hourStr, minuteStr] = localTime.split(':');

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  let dt = DateTime.fromObject({ year, month, day, hour, minute }, { zone });

  if (!dt.isValid) {
    // Gap (spring forward): move to the first valid instant after the gap
    for (let offset = 1; offset <= 120; offset++) {
      const probe = DateTime.fromObject(
        { year, month, day, hour, minute: minute + offset },
        { zone }
      );
      if (probe.isValid) {
        dt = probe;
        break;
      }
    }
  }

  // Fall back: DateTime.fromObject uses the first occurrence by default in Luxon
  return {
    scheduledAt: dt.toUTC(),
    actualLocalDate: dt.toFormat('yyyy-MM-dd'),
    actualLocalTime: dt.toFormat('HH:mm')
  };
}

/**
 * Generates doses for a medication schedule for the next horizon (default 48 hours).
 * Employs ON CONFLICT DO NOTHING to guarantee no duplicate doses.
 */
export async function generateDosesForSchedule(
  schedule: MedicationSchedule & { medication: Medication },
  timezone: string,
  horizonHours = 48,
  fromInstant?: DateTime
): Promise<number> {
  const med = schedule.medication;
  if (med.status !== 'ACTIVE' || !schedule.isActive) {
    return 0;
  }

  const nowLocal = (fromInstant || DateTime.now()).setZone(timezone);
  const endLocal = nowLocal.plus({ hours: horizonHours });

  // Iterate calendar days within the window in profile local time
  let currentDay = nowLocal.startOf('day');
  const lastDay = endLocal.endOf('day');

  const dosesToInsert: {
    id: string;
    profileId: string;
    medicationId: string;
    scheduleId: string;
    localDate: string;
    localTime: string;
    scheduledAt: Date;
    timezone: string;
  }[] = [];

  while (currentDay <= lastDay) {
    const localDateStr = currentDay.toFormat('yyyy-MM-dd');
    const weekday = currentDay.weekday; // 1 = Monday, 7 = Sunday

    // Check if schedule runs on this weekday
    const runsToday =
      schedule.weekdays.length === 0 || schedule.weekdays.includes(weekday);

    if (runsToday) {
      // Check medication start and end dates
      const medStart = DateTime.fromJSDate(med.startDate).setZone(timezone).startOf('day');
      const medEnd = med.endDate
        ? DateTime.fromJSDate(med.endDate).setZone(timezone).endOf('day')
        : null;

      if (currentDay >= medStart && (!medEnd || currentDay <= medEnd)) {
        for (const wallTime of schedule.timesOfDay) {
          const { scheduledAt } = resolveWallClockInstant(localDateStr, wallTime, timezone);

          // Only include if scheduledAt is within horizon window
          if (scheduledAt >= nowLocal.minus({ hours: 1 }) && scheduledAt <= endLocal) {
            dosesToInsert.push({
              id: crypto.randomUUID(),
              profileId: med.profileId,
              medicationId: med.id,
              scheduleId: schedule.id,
              localDate: localDateStr,
              localTime: wallTime,
              scheduledAt: scheduledAt.toJSDate(),
              timezone
            });
          }
        }
      }
    }

    currentDay = currentDay.plus({ days: 1 });
  }

  if (dosesToInsert.length === 0) {
    return 0;
  }

  let insertedCount = 0;

  // Insert using raw SQL with ON CONFLICT DO NOTHING to strictly prevent duplicates
  for (const dose of dosesToInsert) {
    const result = await prisma.$executeRaw`
      INSERT INTO "MedicationDose" (
        "id", "profileId", "medicationId", "scheduleId",
        "localDate", "localTime", "scheduledAt", "timezone",
        "status", "version", "snoozeCount", "createdAt", "updatedAt"
      )
      VALUES (
        ${dose.id}, ${dose.profileId}, ${dose.medicationId}, ${dose.scheduleId},
        ${dose.localDate}, ${dose.localTime}, ${dose.scheduledAt}, ${dose.timezone},
        'PENDING', 1, 0, now(), now()
      )
      ON CONFLICT ("scheduleId", "localDate", "localTime") DO NOTHING;
    `;
    insertedCount += Number(result);
  }

  return insertedCount;
}

/**
 * Generates future doses for all active medications belonging to a profile.
 */
export async function generateDosesForProfile(options: GenerateDosesOptions): Promise<number> {
  const profile = await prisma.elderlyProfile.findUnique({
    where: { id: options.profileId },
    include: {
      medications: {
        where: { status: 'ACTIVE', deletedAt: null },
        include: {
          schedules: {
            where: { isActive: true }
          }
        }
      }
    }
  });

  if (!profile) return 0;

  let totalInserted = 0;
  for (const med of profile.medications) {
    for (const schedule of med.schedules) {
      const count = await generateDosesForSchedule(
        { ...schedule, medication: med },
        profile.timezone,
        options.horizonHours || 48,
        options.fromInstant
      );
      totalInserted += count;
    }
  }

  return totalInserted;
}

/**
 * Handles timezone change (Owner-only):
 * In one transaction:
 * 1. Voids future unacted doses (PENDING/SNOOZED with scheduledAt > now)
 * 2. Leaves past doses and logs untouched
 * 3. Regenerates doses under the new timezone
 */
export async function handleTimezoneChange(
  profileId: string,
  newTimezone: string,
  actorUserId: string
): Promise<void> {
  if (!IANAZone.isValidSpecifier(newTimezone)) {
    throw new Error('Invalid IANA timezone specifier');
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 1. Void future unacted doses
    await tx.medicationDose.updateMany({
      where: {
        profileId,
        status: { in: ['PENDING', 'SNOOZED'] },
        scheduledAt: { gt: now },
        voidedAt: null
      },
      data: {
        voidedAt: now
      }
    });

    // 2. Update profile timezone
    await tx.elderlyProfile.update({
      where: { id: profileId },
      data: { timezone: newTimezone }
    });

    // 3. Log Audit
    await tx.auditLog.create({
      data: {
        profileId,
        userId: actorUserId,
        action: 'TIMEZONE_CHANGED',
        entityType: 'ElderlyProfile',
        entityId: profileId,
        details: { newTimezone },
        timestamp: now
      }
    });
  });

  // 4. Regenerate under new timezone
  await generateDosesForProfile({ profileId });
}
