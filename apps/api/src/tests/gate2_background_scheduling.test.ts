import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../db/prisma';
import { hashPassword } from '../utils/crypto';
import { generateDosesForSchedule } from '../services/doseGenerator';
import { scheduleJobsForUpcomingDoses } from '../services/jobHandlers';
import { WorkerService } from '../services/workerService';
import { transitionDose } from '../services/doseStateMachine';
import { getNotificationsForUser } from '../services/notificationService';

describe('Gate 2: Background Scheduling with Browser Closed', () => {
  let ownerUserId: string;
  let caregiverUserId: string;
  let profileId: string;
  let medicationId: string;
  let scheduleId: string;
  let worker: WorkerService;

  beforeAll(async () => {
    // 1. Setup Owner and Caregiver users
    const ownerHash = await hashPassword('OwnerPass123!');
    const owner = await prisma.user.create({
      data: {
        email: `gate2-owner-${Date.now()}@carebuddy.local`,
        passwordHash: ownerHash,
        name: 'Grandma Martha'
      }
    });
    ownerUserId = owner.id;

    const cgHash = await hashPassword('CaregiverPass123!');
    const caregiver = await prisma.user.create({
      data: {
        email: `gate2-cg-${Date.now()}@carebuddy.local`,
        passwordHash: cgHash,
        name: 'Nurse John'
      }
    });
    caregiverUserId = caregiver.id;

    // 2. Setup Profile with 15m grace period
    const profile = await prisma.elderlyProfile.create({
      data: {
        ownerUserId,
        name: 'Martha Stewart',
        timezone: 'Asia/Kolkata',
        reminderLeadMinutes: 10,
        overdueGraceMinutes: 15
      }
    });
    profileId = profile.id;

    // 3. Setup CareNetwork with caregiver having viewMedications = true
    const network = await prisma.careNetwork.create({
      data: { profileId }
    });

    await prisma.careNetworkMember.create({
      data: {
        careNetworkId: network.id,
        userId: caregiverUserId,
        role: 'CAREGIVER',
        status: 'ACTIVE',
        viewMedications: true,
        recordDoses: true
      }
    });

    // 4. Create Medication and Schedule
    const med = await prisma.medication.create({
      data: {
        profileId,
        name: 'Lisinopril',
        dosage: '10mg',
        strength: '10mg',
        medicineType: 'TABLET',
        startDate: new Date(),
        confirmedPrescriptionSource: true,
        status: 'ACTIVE'
      }
    });
    medicationId = med.id;

    const sched = await prisma.medicationSchedule.create({
      data: {
        medicationId: med.id,
        version: 1,
        frequency: 'ONCE_DAILY',
        timesOfDay: ['09:00'],
        weekdays: [],
        effectiveFrom: new Date(),
        isActive: true
      }
    });
    scheduleId = sched.id;

    // Generate doses and queue jobs
    await generateDosesForSchedule({ ...sched, medication: med }, 'Asia/Kolkata', 48);
    await scheduleJobsForUpcomingDoses(profileId);

    // Initialize Worker instance (completely decoupled from web browser)
    worker = new WorkerService('gate2-test-worker');
  });

  afterAll(async () => {
    if (worker) {
      await worker.stop();
    }
    await prisma.$disconnect();
  });

  it('enqueues DOSE_UPCOMING and DOSE_MISSED_CHECK background jobs for pending doses', async () => {
    const jobs = await prisma.scheduledJob.findMany({
      where: { profileId },
      orderBy: { runAt: 'asc' }
    });

    expect(jobs.length).toBeGreaterThanOrEqual(2);

    const upcomingJob = jobs.find((j) => j.type === 'DOSE_UPCOMING');
    const missedJob = jobs.find((j) => j.type === 'DOSE_MISSED_CHECK');

    expect(upcomingJob).toBeDefined();
    expect(upcomingJob?.status).toBe('QUEUED');
    expect(missedJob).toBeDefined();
    expect(missedJob?.status).toBe('QUEUED');
  });

  it('processes DOSE_UPCOMING job and delivers in-app notifications without active browser', async () => {
    // Pick the first upcoming job and set runAt to the past
    const upcomingJob = await prisma.scheduledJob.findFirst({
      where: { profileId, type: 'DOSE_UPCOMING', status: 'QUEUED' }
    });
    expect(upcomingJob).toBeDefined();

    await prisma.scheduledJob.update({
      where: { id: upcomingJob!.id },
      data: { runAt: new Date(Date.now() - 5000) }
    });

    // Run one worker poll cycle
    const claimedCount = await worker.pollCycle();
    expect(claimedCount).toBeGreaterThanOrEqual(1);

    // Verify job is now SUCCEEDED
    const updatedJob = await prisma.scheduledJob.findUnique({
      where: { id: upcomingJob!.id }
    });
    expect(updatedJob?.status).toBe('SUCCEEDED');

    // Verify in-app notifications delivered to both Owner and Caregiver
    const ownerNotifs = await getNotificationsForUser(ownerUserId);
    const cgNotifs = await getNotificationsForUser(caregiverUserId);

    expect(ownerNotifs.notifications.some((n) => n.type === 'DOSE_UPCOMING')).toBe(true);
    expect(cgNotifs.notifications.some((n) => n.type === 'DOSE_UPCOMING')).toBe(true);
  });

  it('marks dose as MISSED by the worker at grace deadline with immutable log and alert notification', async () => {
    const missedJob = await prisma.scheduledJob.findFirst({
      where: { profileId, type: 'DOSE_MISSED_CHECK', status: 'QUEUED' }
    });
    expect(missedJob).toBeDefined();

    const doseId = (missedJob!.payload as any).doseId;

    // Simulate grace deadline expiry
    await prisma.scheduledJob.update({
      where: { id: missedJob!.id },
      data: { runAt: new Date(Date.now() - 5000) }
    });

    // Run worker poll cycle
    const claimedCount = await worker.pollCycle();
    expect(claimedCount).toBeGreaterThanOrEqual(1);

    // Verify job completed
    const updatedJob = await prisma.scheduledJob.findUnique({
      where: { id: missedJob!.id }
    });
    expect(updatedJob?.status).toBe('SUCCEEDED');

    // Verify dose is now MISSED
    const dose = await prisma.medicationDose.findUnique({
      where: { id: doseId }
    });
    expect(dose?.status).toBe('MISSED');

    // Verify immutable MedicationLog was written with SYSTEM_WORKER
    const logs = await prisma.medicationLog.findMany({
      where: { doseId }
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const missedLog = logs.find((l) => l.action === 'MISSED');
    expect(missedLog).toBeDefined();
    expect(missedLog?.actionSource).toBe('SYSTEM_WORKER');
    expect(missedLog?.reason).toContain('grace period');

    // Verify in-app DOSE_MISSED notifications delivered
    const ownerNotifs = await getNotificationsForUser(ownerUserId);
    const cgNotifs = await getNotificationsForUser(caregiverUserId);

    const ownerMissed = ownerNotifs.notifications.find((n) => n.type === 'DOSE_MISSED');
    const cgMissed = cgNotifs.notifications.find((n) => n.type === 'DOSE_MISSED');

    expect(ownerMissed).toBeDefined();
    expect(cgMissed).toBeDefined();
  });

  it('strictly forbids client apps or snoozing from transitioning to MISSED (Section 5.2 & Gate 6)', async () => {
    const freshDose = await prisma.medicationDose.findFirst({
      where: { profileId, status: 'PENDING' }
    });

    if (freshDose) {
      await expect(
        transitionDose({
          doseId: freshDose.id,
          targetState: 'MISSED',
          actorUserId: ownerUserId,
          actionSource: 'OWNER_APP',
          reason: 'Client attempting illegal state transition'
        })
      ).rejects.toThrow('Only the background system worker can mark doses as MISSED');
    }
  });
});
