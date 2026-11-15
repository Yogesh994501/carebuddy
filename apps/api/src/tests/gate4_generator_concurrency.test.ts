import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../db/prisma';
import { generateDosesForSchedule } from '../services/doseGenerator';
import { hashPassword } from '../utils/crypto';

describe('Gate 4 (Generation Half): Concurrency & Duplicate Prevention', () => {
  let userId: string;
  let profileId: string;
  let medicationId: string;
  let scheduleId: string;

  beforeAll(async () => {
    const hash = await hashPassword('Password123!');
    const user = await prisma.user.create({
      data: { email: 'gate4@carebuddy.local', passwordHash: hash, name: 'Gate4 Tester' }
    });
    userId = user.id;

    const profile = await prisma.elderlyProfile.create({
      data: {
        name: 'Grandpa Concurrency',
        timezone: 'Asia/Kolkata',
        ownerUserId: userId
      }
    });
    profileId = profile.id;

    const med = await prisma.medication.create({
      data: {
        profileId,
        name: 'Amlodipine',
        strength: '5mg',
        dosage: '1 tablet',
        medicineType: 'TABLET',
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE'
      }
    });
    medicationId = med.id;

    const schedule = await prisma.medicationSchedule.create({
      data: {
        medicationId,
        version: 1,
        frequency: 'TWICE_DAILY',
        timesOfDay: ['08:00', '20:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        isActive: true
      }
    });
    scheduleId = schedule.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('generates zero duplicate doses when two workers run generation concurrently', async () => {
    const med = await prisma.medication.findUniqueOrThrow({ where: { id: medicationId } });
    const schedule = await prisma.medicationSchedule.findUniqueOrThrow({ where: { id: scheduleId } });

    // Simulate two concurrent workers executing generation simultaneously
    const [worker1Result, worker2Result] = await Promise.all([
      generateDosesForSchedule({ ...schedule, medication: med }, 'Asia/Kolkata', 48),
      generateDosesForSchedule({ ...schedule, medication: med }, 'Asia/Kolkata', 48)
    ]);

    // Query all generated doses for this schedule
    const doses = await prisma.medicationDose.findMany({
      where: { scheduleId }
    });

    // Check for duplicates by (scheduleId, localDate, localTime)
    const slotKeys = new Set<string>();
    let duplicatesFound = 0;

    for (const dose of doses) {
      const key = `${dose.scheduleId}:${dose.localDate}:${dose.localTime}`;
      if (slotKeys.has(key)) {
        duplicatesFound++;
      } else {
        slotKeys.add(key);
      }
    }

    expect(duplicatesFound).toBe(0);
    // At twice daily over ~3 calendar days in the 48h window, expect ~4 to 6 unique slots
    expect(doses.length).toBeGreaterThanOrEqual(4);
    expect(slotKeys.size).toBe(doses.length);
  });

  it('repeated generation runs (replaying after simulated crash) insert 0 new records', async () => {
    const med = await prisma.medication.findUniqueOrThrow({ where: { id: medicationId } });
    const schedule = await prisma.medicationSchedule.findUniqueOrThrow({ where: { id: scheduleId } });

    // Initial count of doses
    const beforeCount = await prisma.medicationDose.count({ where: { scheduleId } });

    // Run generator a 3rd time (replaying job)
    const replayInserted = await generateDosesForSchedule(
      { ...schedule, medication: med },
      'Asia/Kolkata',
      48
    );

    const afterCount = await prisma.medicationDose.count({ where: { scheduleId } });

    // Replay should insert 0 new rows
    expect(replayInserted).toBe(0);
    expect(afterCount).toBe(beforeCount);
  });
});
