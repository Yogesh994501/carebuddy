import { ScheduledJob } from '@prisma/client';
import { prisma } from '../db/prisma';
import { generateDosesForSchedule, generateDosesForProfile } from './doseGenerator';
import { transitionDose } from './doseStateMachine';
import { sendNotification } from './notificationService';
import { completeJob, expireJob, failJob, enqueueJob } from './jobQueue';

/**
 * Main dispatcher to execute a claimed background job
 */
export async function executeJob(job: ScheduledJob): Promise<void> {
  try {
    switch (job.type) {
      case 'GENERATE_DOSES':
        await handleGenerateDoses(job);
        break;
      case 'DOSE_UPCOMING':
        await handleDoseUpcoming(job);
        break;
      case 'DOSE_MISSED_CHECK':
        await handleDoseMissedCheck(job);
        break;
      case 'APPOINTMENT_REMINDER':
        await handleAppointmentReminder(job);
        break;
      default:
        console.warn(`Unknown job type: ${(job as any).type}`);
    }

    await completeJob(job.id);
  } catch (err: any) {
    console.error(`Error executing job ${job.id} (${job.type}):`, err.message);
    await failJob(job, err);
  }
}

/**
 * Handler: GENERATE_DOSES
 * Rolls forward 48 hours of doses and queues reminders
 */
async function handleGenerateDoses(job: ScheduledJob): Promise<void> {
  const payload = (job.payload as any) || {};
  const { profileId, scheduleId } = payload;

  if (scheduleId) {
    const schedule = await prisma.medicationSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        medication: {
          include: { profile: true }
        }
      }
    });

    if (schedule && schedule.medication?.profile) {
      await generateDosesForSchedule(
        schedule,
        schedule.medication.profile.timezone,
        48
      );
      await scheduleJobsForUpcomingDoses(schedule.medication.profile.id);
    }
  } else if (profileId) {
    await generateDosesForProfile({ profileId, horizonHours: 48 });
    await scheduleJobsForUpcomingDoses(profileId);
  } else {
    // System-wide: process all profiles
    const profiles = await prisma.elderlyProfile.findMany({
      select: { id: true }
    });

    for (const profile of profiles) {
      await generateDosesForProfile({ profileId: profile.id, horizonHours: 48 });
      await scheduleJobsForUpcomingDoses(profile.id);
    }
  }
}

/**
 * Schedule DOSE_UPCOMING and DOSE_MISSED_CHECK for all pending doses of a profile
 */
export async function scheduleJobsForUpcomingDoses(profileId: string): Promise<void> {
  const profile = await prisma.elderlyProfile.findUnique({
    where: { id: profileId },
    select: {
      reminderLeadMinutes: true,
      overdueGraceMinutes: true
    }
  });

  if (!profile) return;

  const reminderLead = profile.reminderLeadMinutes || 15;
  const graceMinutes = profile.overdueGraceMinutes || 60;

  // Find all PENDING doses in the future or within grace window
  const doses = await prisma.medicationDose.findMany({
    where: {
      profileId,
      status: { in: ['PENDING', 'SNOOZED'] }
    }
  });

  for (const dose of doses) {
    const scheduledTime = new Date(dose.scheduledAt).getTime();

    // 1. DOSE_UPCOMING job: lead minutes before scheduled time
    const upcomingRunAt = new Date(scheduledTime - reminderLead * 60 * 1000);
    const upcomingKey = `DOSE_UPCOMING:${dose.id}`;

    await enqueueJob({
      profileId,
      type: 'DOSE_UPCOMING',
      runAt: upcomingRunAt,
      idempotencyKey: upcomingKey,
      payload: { doseId: dose.id }
    });

    // 2. DOSE_MISSED_CHECK job: grace minutes after scheduled time
    const missedCheckRunAt = new Date(scheduledTime + graceMinutes * 60 * 1000);
    const missedKey = `DOSE_MISSED_CHECK:${dose.id}`;

    await enqueueJob({
      profileId,
      type: 'DOSE_MISSED_CHECK',
      runAt: missedCheckRunAt,
      idempotencyKey: missedKey,
      payload: { doseId: dose.id }
    });
  }
}

/**
 * Handler: DOSE_UPCOMING
 * Delivers in-app notification when dose is upcoming
 */
async function handleDoseUpcoming(job: ScheduledJob): Promise<void> {
  const payload = (job.payload as any) || {};
  const { doseId } = payload;
  if (!doseId) return;

  const dose = await prisma.medicationDose.findUnique({
    where: { id: doseId },
    include: {
      medication: true,
      profile: {
        include: {
          careNetwork: {
            include: {
              members: {
                where: { status: 'ACTIVE' }
              }
            }
          }
        }
      }
    }
  });

  if (!dose) return;

  // If already taken, skipped, or missed, no reminder needed
  if (dose.status !== 'PENDING' && dose.status !== 'SNOOZED') {
    return;
  }

  // Stale catch-up check: if current time is past scheduledAt + grace period, do not late-fire
  const graceMs = (dose.profile.overdueGraceMinutes || 60) * 60 * 1000;
  if (Date.now() > dose.scheduledAt.getTime() + graceMs) {
    await expireJob(job.id, 'Dose window expired; skipped late upcoming notification.');
    return;
  }

  // Collect recipients:
  // 1. Owner
  const recipients = new Set<string>();
  if (dose.profile.ownerUserId) {
    recipients.add(dose.profile.ownerUserId);
  }

  // 2. Members with viewMedications = true
  if (dose.profile.careNetwork?.members) {
    for (const member of dose.profile.careNetwork.members) {
      if (member.viewMedications) {
        recipients.add(member.userId);
      }
    }
  }

  for (const recipientId of recipients) {
    await sendNotification({
      recipientId,
      profileId: dose.profileId,
      type: 'DOSE_UPCOMING',
      title: 'Medication Reminder',
      message: `It is time to take ${dose.medication.name} (${dose.medication.dosage}) - scheduled for ${dose.localTime}.`,
      entityId: dose.id,
      occurrenceKey: dose.scheduledAt.toISOString()
    });
  }
}

/**
 * Handler: DOSE_MISSED_CHECK
 * Crucial Gate 2 & Gate 6 check: Transition dose to MISSED at grace deadline
 * Only the background worker can set MISSED (Section 5.2 & Gate 6).
 */
async function handleDoseMissedCheck(job: ScheduledJob): Promise<void> {
  const payload = (job.payload as any) || {};
  const { doseId } = payload;
  if (!doseId) return;

  const dose = await prisma.medicationDose.findUnique({
    where: { id: doseId },
    include: {
      medication: true,
      profile: {
        include: {
          careNetwork: {
            include: {
              members: {
                where: { status: 'ACTIVE' }
              }
            }
          }
        }
      }
    }
  });

  if (!dose) return;

  // If already taken, skipped, or already missed, nothing to do
  if (dose.status === 'TAKEN' || dose.status === 'SKIPPED' || dose.status === 'MISSED') {
    return;
  }

  // If currently snoozed, check whether snooze time + grace has passed
  if (dose.status === 'SNOOZED' && dose.snoozedUntil) {
    const graceMs = (dose.profile.overdueGraceMinutes || 60) * 60 * 1000;
    if (Date.now() < dose.snoozedUntil.getTime() + graceMs) {
      // Re-queue check for when snooze grace expires
      const nextRunAt = new Date(dose.snoozedUntil.getTime() + graceMs);
      await enqueueJob({
        profileId: dose.profileId,
        type: 'DOSE_MISSED_CHECK',
        runAt: nextRunAt,
        idempotencyKey: `DOSE_MISSED_CHECK:${dose.id}:${dose.snoozeCount}`,
        payload: { doseId: dose.id }
      });
      return;
    }
  }

  // Transition dose to MISSED via state machine (enforces SYSTEM_WORKER authorization)
  await transitionDose({
    doseId: dose.id,
    targetState: 'MISSED',
    actorUserId: 'system-worker',
    actionSource: 'SYSTEM_WORKER',
    reason: 'Dose not recorded within grace period'
  });

  // Notify owner and care network members
  const recipients = new Set<string>();
  if (dose.profile.ownerUserId) {
    recipients.add(dose.profile.ownerUserId);
  }

  if (dose.profile.careNetwork?.members) {
    for (const member of dose.profile.careNetwork.members) {
      if (member.viewMedications || member.viewAdherence) {
        recipients.add(member.userId);
      }
    }
  }

  for (const recipientId of recipients) {
    await sendNotification({
      recipientId,
      profileId: dose.profileId,
      type: 'DOSE_MISSED',
      title: 'Missed Medication Alert',
      message: `${dose.medication.name} (${dose.medication.dosage}) scheduled for ${dose.localTime} was not recorded within the grace period.`,
      entityId: dose.id,
      occurrenceKey: dose.scheduledAt.toISOString()
    });
  }
}

/**
 * Handler: APPOINTMENT_REMINDER
 * Sends 24h and 2h reminders before scheduled appointments
 */
async function handleAppointmentReminder(job: ScheduledJob): Promise<void> {
  const payload = (job.payload as any) || {};
  const { appointmentId, reminderType } = payload;
  if (!appointmentId) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      profile: {
        include: {
          careNetwork: {
            include: {
              members: {
                where: { status: 'ACTIVE' }
              }
            }
          }
        }
      }
    }
  });

  if (!appointment || appointment.status !== 'SCHEDULED') {
    return;
  }

  // Stale check: if appointment time is in the past, skip
  if (Date.now() > appointment.scheduledAt.getTime()) {
    await expireJob(job.id, 'Appointment has already passed.');
    return;
  }

  const recipients = new Set<string>();
  if (appointment.profile.ownerUserId) {
    recipients.add(appointment.profile.ownerUserId);
  }

  if (appointment.profile.careNetwork?.members) {
    for (const member of appointment.profile.careNetwork.members) {
      if (member.viewAppointments) {
        recipients.add(member.userId);
      }
    }
  }

  const timingText = reminderType === '24H' ? 'tomorrow' : 'in 2 hours';

  for (const recipientId of recipients) {
    await sendNotification({
      recipientId,
      profileId: appointment.profileId,
      type: 'APPOINTMENT_UPCOMING',
      title: 'Upcoming Medical Appointment',
      message: `Appointment with ${appointment.doctor} at ${appointment.clinic} is scheduled ${timingText} (${appointment.localDate} at ${appointment.localTime}).`,
      entityId: appointment.id,
      occurrenceKey: `${appointment.id}:${reminderType}`
    });
  }
}
