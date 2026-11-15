import { prisma } from '../db/prisma';
import { DoseStatus, DoseActionSource, MedicationDose } from '@prisma/client';
import { DateTime } from 'luxon';

export interface TransitionDoseInput {
  doseId: string;
  targetState: DoseStatus;
  actorUserId: string;
  actionSource: DoseActionSource;
  actedOnBehalf?: boolean;
  reason?: string;
  takenAt?: Date;
  idempotencyKey?: string;
  isCorrection?: boolean;
}

export interface TransitionResult {
  success: boolean;
  dose: MedicationDose;
  conflict?: boolean;
  idempotentReplay?: boolean;
}

// In-memory idempotency cache for dose actions (or DB cached)
const idempotencyStore = new Map<string, { dose: MedicationDose; timestamp: number }>();

/**
 * Transitions a dose from its current state to a target state, adhering strictly to
 * the state machine transition table (Section 5.2):
 *
 * PENDING  -> TAKEN, SKIPPED, SNOOZED, MISSED (system worker only)
 * SNOOZED  -> TAKEN, SKIPPED, SNOOZED (within limit), MISSED (system worker only)
 * TERMINAL -> Another TERMINAL (Correction only with reason)
 * TAKEN    -> PENDING (Correction only, and only while grace deadline has not passed)
 */
export async function transitionDose(input: TransitionDoseInput): Promise<TransitionResult> {
  const {
    doseId,
    targetState,
    actorUserId,
    actionSource,
    actedOnBehalf = false,
    reason,
    takenAt,
    idempotencyKey,
    isCorrection = false
  } = input;

  // 1. Idempotency replay check
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    const cached = idempotencyStore.get(idempotencyKey)!;
    return {
      success: true,
      dose: cached.dose,
      idempotentReplay: true
    };
  }

  // 2. Fetch current dose and profile configuration
  const currentDose = await prisma.medicationDose.findUnique({
    where: { id: doseId },
    include: {
      profile: true,
      medication: true
    }
  });

  if (!currentDose) {
    throw new Error('DOSE_NOT_FOUND');
  }

  const { status: currentStatus, profile, medication } = currentDose;

  // 3. Validate state transitions
  const isTerminal = (s: DoseStatus) => ['TAKEN', 'SKIPPED', 'MISSED'].includes(s);

  let allowedFrom: DoseStatus[] = [];

  if (isCorrection) {
    // Correction rules:
    // Any terminal state -> Another terminal state (reason required)
    // TAKEN -> PENDING (only while grace deadline has not passed)
    if (!reason || reason.trim().length === 0) {
      throw new Error('A reason is strictly required to correct a recorded dose.');
    }

    if (targetState === 'PENDING') {
      if (currentStatus !== 'TAKEN') {
        throw new Error('Only TAKEN doses can be corrected back to PENDING.');
      }
      const graceDeadline = DateTime.fromJSDate(currentDose.scheduledAt).plus({
        minutes: profile.overdueGraceMinutes
      });
      if (DateTime.now() > graceDeadline) {
        throw new Error('Cannot revert TAKEN to PENDING because the overdue grace period has expired.');
      }
      allowedFrom = ['TAKEN'];
    } else if (isTerminal(targetState)) {
      if (!isTerminal(currentStatus)) {
        throw new Error('Correction endpoint is only for terminal states.');
      }
      allowedFrom = ['TAKEN', 'SKIPPED', 'MISSED'];
    } else {
      throw new Error(`Invalid target correction state: ${targetState}`);
    }
  } else {
    // Standard transitions:
    if (targetState === 'TAKEN' || targetState === 'SKIPPED') {
      allowedFrom = ['PENDING', 'SNOOZED'];
    } else if (targetState === 'SNOOZED') {
      allowedFrom = ['PENDING', 'SNOOZED'];
      if (currentDose.snoozeCount >= profile.maxSnoozeCount) {
        throw new Error(`Maximum snooze limit (${profile.maxSnoozeCount}) reached for this dose.`);
      }
    } else if (targetState === 'MISSED') {
      // MISSED can only be set by system worker
      if (actionSource !== 'SYSTEM_WORKER') {
        throw new Error('Only the background system worker can mark doses as MISSED.');
      }
      allowedFrom = ['PENDING', 'SNOOZED'];
    } else {
      throw new Error(`Invalid transition from ${currentStatus} to ${targetState}`);
    }
  }

  if (!allowedFrom.includes(currentStatus)) {
    return {
      success: false,
      conflict: true,
      dose: currentDose
    };
  }

  // 4. Compute update values
  const now = new Date();
  let effectiveTakenAt: Date | null = null;
  if (targetState === 'TAKEN') {
    if (takenAt && takenAt > now) {
      throw new Error('Intake time cannot be in the future.');
    }
    effectiveTakenAt = takenAt || now;
  }

  let newSnoozeCount = currentDose.snoozeCount;
  let newSnoozedUntil: Date | null = currentDose.snoozedUntil;
  if (targetState === 'SNOOZED') {
    newSnoozeCount += 1;
    newSnoozedUntil = new Date(now.getTime() + profile.snoozeDurationMinutes * 60 * 1000);
  } else if (targetState !== currentStatus) {
    newSnoozedUntil = null;
  }

  // 5. Atomic conditional update & append-only log insertion in ONE transaction
  const updatedDose = await prisma.$transaction(async (tx) => {
    // Conditional optimistic concurrency update
    const updateResult = await tx.medicationDose.updateMany({
      where: {
        id: doseId,
        version: currentDose.version,
        status: { in: allowedFrom }
      },
      data: {
        status: targetState,
        version: currentDose.version + 1,
        takenAt: targetState === 'TAKEN' ? effectiveTakenAt : (isCorrection ? null : currentDose.takenAt),
        confirmedByUserId: targetState === 'TAKEN' ? actorUserId : currentDose.confirmedByUserId,
        actionSource,
        actedOnBehalf,
        snoozeCount: newSnoozeCount,
        snoozedUntil: newSnoozedUntil,
        skipReason: targetState === 'SKIPPED' ? reason : currentDose.skipReason,
        correctionReason: isCorrection ? reason : currentDose.correctionReason,
        updatedAt: now
      }
    });

    if (updateResult.count === 0) {
      // Another concurrent request modified this dose
      const freshDose = await tx.medicationDose.findUnique({ where: { id: doseId } });
      throw new Error('CONCURRENT_MODIFICATION');
    }

    // Append-only MedicationLog
    await tx.medicationLog.create({
      data: {
        doseId,
        medicationId: currentDose.medicationId,
        profileId: currentDose.profileId,
        actorUserId,
        action: targetState,
        actionSource,
        actedOnBehalf,
        reason: reason || null,
        previousState: currentStatus,
        newState: targetState,
        timestamp: now
      }
    });

    // Append-only AuditLog
    await tx.auditLog.create({
      data: {
        profileId: currentDose.profileId,
        userId: actorUserId,
        action: isCorrection ? 'DOSE_CORRECTION' : `DOSE_${targetState}`,
        entityType: 'MedicationDose',
        entityId: doseId,
        details: {
          previousState: currentStatus,
          newState: targetState,
          isCorrection,
          reason,
          actionSource,
          actedOnBehalf
        },
        timestamp: now
      }
    });

    // Refill count tracking [S]: decrement remaining pills on TAKEN
    if (targetState === 'TAKEN' && currentStatus !== 'TAKEN') {
      if (medication.currentPillsRemaining && medication.currentPillsRemaining > 0) {
        await tx.medication.update({
          where: { id: medication.id },
          data: {
            currentPillsRemaining: medication.currentPillsRemaining - 1
          }
        });
      }
    } else if (currentStatus === 'TAKEN' && targetState !== 'TAKEN') {
      // Reverted or corrected away from TAKEN -> restore pill
      if (medication.currentPillsRemaining !== null) {
        await tx.medication.update({
          where: { id: medication.id },
          data: {
            currentPillsRemaining: medication.currentPillsRemaining + 1
          }
        });
      }
    }

    const result = await tx.medicationDose.findUnique({ where: { id: doseId } });
    return result!;
  });

  // Store in idempotency store
  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, {
      dose: updatedDose,
      timestamp: Date.now()
    });
  }

  return {
    success: true,
    dose: updatedDose
  };
}
