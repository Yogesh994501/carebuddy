import { DateTime } from 'luxon';
import { prisma } from '../db/prisma';

export type AdherenceWindow = 'today' | '7d' | '30d';

export interface AdherenceResult {
  window: AdherenceWindow;
  timezone: string;
  startDate: string;
  endDate: string;
  overall: {
    percentage: number | null; // null if no data
    label: string;
    taken: number;
    skipped: number;
    missed: number;
    totalEligible: number;
  };
  byMedication: {
    medicationId: string;
    medicationName: string;
    percentage: number | null;
    label: string;
    taken: number;
    skipped: number;
    missed: number;
    totalEligible: number;
  }[];
}

export async function calculateAdherence(
  profileId: string,
  window: AdherenceWindow = '7d'
): Promise<AdherenceResult> {
  const profile = await prisma.elderlyProfile.findUnique({
    where: { id: profileId },
    include: {
      medications: {
        where: { deletedAt: null }
      }
    }
  });

  if (!profile) {
    throw new Error('Profile not found');
  }

  const timezone = profile.timezone;
  const now = DateTime.now().setZone(timezone);

  let windowStart: DateTime;
  if (window === 'today') {
    windowStart = now.startOf('day');
  } else if (window === '7d') {
    windowStart = now.minus({ days: 7 }).startOf('day');
  } else {
    // 30d
    windowStart = now.minus({ days: 30 }).startOf('day');
  }

  // Fetch all doses in this profile within or before the window
  const doses = await prisma.medicationDose.findMany({
    where: {
      profileId,
      voidedAt: null,
      scheduledAt: {
        gte: windowStart.toJSDate(),
        lte: now.toJSDate()
      }
    },
    include: {
      medication: true
    }
  });

  // Filter for eligible doses according to Section 5.3:
  // 1. Not voided (already filtered in query)
  // 2. scheduledAt + grace already passed
  // 3. Medication was active (not paused, not before start, not after end/discontinued)
  // 4. Terminal state (TAKEN, SKIPPED, MISSED)
  const eligibleDoses = doses.filter((dose) => {
    const scheduledInstant = DateTime.fromJSDate(dose.scheduledAt).setZone(timezone);
    const graceDeadline = scheduledInstant.plus({ minutes: profile.overdueGraceMinutes });

    // Grace period must have already passed
    if (now < graceDeadline) {
      return false;
    }

    // Must be in a terminal state
    if (!['TAKEN', 'SKIPPED', 'MISSED'].includes(dose.status)) {
      return false;
    }

    // Check medication active bounds
    const med = dose.medication;
    const medStart = DateTime.fromJSDate(med.startDate).setZone(timezone).startOf('day');
    if (scheduledInstant < medStart) return false;

    if (med.endDate) {
      const medEnd = DateTime.fromJSDate(med.endDate).setZone(timezone).endOf('day');
      if (scheduledInstant > medEnd) return false;
    }

    return true;
  });

  // Calculate overall counts
  let taken = 0;
  let skipped = 0;
  let missed = 0;

  const medMap = new Map<
    string,
    { name: string; taken: number; skipped: number; missed: number }
  >();

  // Initialize for all active medications
  profile.medications.forEach((m) => {
    medMap.set(m.id, { name: m.name, taken: 0, skipped: 0, missed: 0 });
  });

  for (const dose of eligibleDoses) {
    if (dose.status === 'TAKEN') taken++;
    else if (dose.status === 'SKIPPED') skipped++;
    else if (dose.status === 'MISSED') missed++;

    const medEntry = medMap.get(dose.medicationId);
    if (medEntry) {
      if (dose.status === 'TAKEN') medEntry.taken++;
      else if (dose.status === 'SKIPPED') medEntry.skipped++;
      else if (dose.status === 'MISSED') medEntry.missed++;
    }
  }

  const totalEligible = taken + skipped + missed;
  const overallPercentage =
    totalEligible === 0 ? null : Math.round((taken / totalEligible) * 100);

  const byMedication = Array.from(medMap.entries()).map(([medId, data]) => {
    const medTotal = data.taken + data.skipped + data.missed;
    const medPercentage =
      medTotal === 0 ? null : Math.round((data.taken / medTotal) * 100);

    return {
      medicationId: medId,
      medicationName: data.name,
      percentage: medPercentage,
      label: medPercentage !== null ? `${medPercentage}%` : 'No data yet',
      taken: data.taken,
      skipped: data.skipped,
      missed: data.missed,
      totalEligible: medTotal
    };
  });

  return {
    window,
    timezone,
    startDate: windowStart.toISODate() || '',
    endDate: now.toISODate() || '',
    overall: {
      percentage: overallPercentage,
      label: overallPercentage !== null ? `${overallPercentage}%` : 'No data yet',
      taken,
      skipped,
      missed,
      totalEligible
    },
    byMedication
  };
}
