import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, DoseStatus, DoseActionSource, ScheduleFrequency, AppointmentStatus } from '@prisma/client';
import argon2 from 'argon2';

describe('Gate 1: End-to-End Data Persistence Across Restarts', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists all clinical, profile, and authorization state across session logouts and restarts', async () => {
    const testEmail = `persistence-${Date.now()}@test.carebuddy.local`;
    const testPassword = 'Password123!Secure';
    const passwordHash = await argon2.hash(testPassword);

    // 1. Create User
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Martha Wayne',
        passwordHash
      }
    });
    expect(user.id).toBeDefined();

    // 2. Create Elderly Profile with custom clinical settings
    const profile = await prisma.elderlyProfile.create({
      data: {
        ownerUserId: user.id,
        name: 'Martha Wayne',
        preferredName: 'Martha',
        timezone: 'America/New_York',
        reminderLeadMinutes: 20,
        overdueGraceMinutes: 45,
        snoozeDurationMinutes: 15,
        maxSnoozeCount: 2,
        bloodGroup: 'O+',
        allergies: 'Penicillin',
        emergencyNotes: 'Severe allergy to penicillin; uses walker.'
      }
    });

    // 3. Create Medication with Schedule
    const med = await prisma.medication.create({
      data: {
        profileId: profile.id,
        name: 'Lisinopril',
        strength: '10 mg',
        dosage: '1 tablet',
        medicineType: 'Tablet',
        instructions: 'Take 1 tablet every morning with water.',
        startDate: new Date('2026-11-01')
      }
    });

    const sched = await prisma.medicationSchedule.create({
      data: {
        medicationId: med.id,
        frequency: ScheduleFrequency.ONCE_DAILY,
        timesOfDay: ['09:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        isActive: true
      }
    });

    // 4. Record Dose & Immutable MedicationLog
    const dose = await prisma.medicationDose.create({
      data: {
        profileId: profile.id,
        medicationId: med.id,
        scheduleId: sched.id,
        localDate: '2026-11-15',
        localTime: '09:00',
        scheduledAt: new Date('2026-11-15T14:00:00Z'),
        timezone: 'America/New_York',
        status: DoseStatus.TAKEN,
        takenAt: new Date('2026-11-15T14:05:00Z'),
        actionSource: DoseActionSource.OWNER_APP
      }
    });

    await prisma.medicationLog.create({
      data: {
        doseId: dose.id,
        medicationId: med.id,
        profileId: profile.id,
        action: DoseStatus.TAKEN,
        actionSource: DoseActionSource.OWNER_APP,
        newState: DoseStatus.TAKEN,
        actorUserId: user.id,
        timestamp: new Date('2026-11-15T14:05:00Z')
      }
    });

    // 5. Create Appointment
    const appointment = await prisma.appointment.create({
      data: {
        profileId: profile.id,
        doctor: 'Dr. Bruce Wayne',
        clinic: 'Gotham Medical Pavilion',
        scheduledAt: new Date('2026-11-20T15:00:00Z'),
        localDate: '2026-11-20',
        localTime: '10:00',
        reason: 'Echocardiogram and blood pressure review',
        status: AppointmentStatus.SCHEDULED,
        createdById: user.id
      }
    });

    // 6. Create Caregiver Note
    const note = await prisma.caregiverNote.create({
      data: {
        profileId: profile.id,
        authorUserId: user.id,
        note: 'Patient slept comfortably through the night. Morning vitals 118/76 mmHg.'
      }
    });

    // 7. Simulate User Session & Subsequent Logout
    const sessionToken = `persisted-session-${Date.now()}`;
    await prisma.session.create({
      data: {
        id: sessionToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 86400000)
      }
    });

    // Simulate Logout (delete session)
    await prisma.session.delete({ where: { id: sessionToken } });
    const deletedSession = await prisma.session.findUnique({ where: { id: sessionToken } });
    expect(deletedSession).toBeNull();

    // 8. Disconnect database client to simulate server / DB connection recycle
    await prisma.$disconnect();

    // 9. Reconnect new Prisma Client instance
    const freshPrisma = new PrismaClient();

    // 10. Re-authenticate with original credentials (argon2 verify)
    const fetchedUser = await freshPrisma.user.findUnique({ where: { email: testEmail } });
    expect(fetchedUser).not.toBeNull();
    const passwordValid = await argon2.verify(fetchedUser!.passwordHash, testPassword);
    expect(passwordValid).toBe(true);

    // 11. Verify Profile, Settings & Clinical Data remain 100% Intact
    const fetchedProfile = await freshPrisma.elderlyProfile.findUnique({
      where: { id: profile.id },
      include: {
        medications: {
          include: { schedules: true }
        },
        doses: true,
        appointments: true,
        careNetwork: true
      }
    });

    expect(fetchedProfile).not.toBeNull();
    expect(fetchedProfile!.name).toBe('Martha Wayne');
    expect(fetchedProfile!.timezone).toBe('America/New_York');
    expect(fetchedProfile!.reminderLeadMinutes).toBe(20);
    expect(fetchedProfile!.overdueGraceMinutes).toBe(45);
    expect(fetchedProfile!.allergies).toBe('Penicillin');

    // Medications verified
    expect(fetchedProfile!.medications).toHaveLength(1);
    expect(fetchedProfile!.medications[0].name).toBe('Lisinopril');
    expect(fetchedProfile!.medications[0].schedules[0].timesOfDay).toEqual(['09:00']);

    // Dose & Immutable Log verified
    expect(fetchedProfile!.doses).toHaveLength(1);
    expect(fetchedProfile!.doses[0].status).toBe(DoseStatus.TAKEN);

    const fetchedLogs = await freshPrisma.medicationLog.findMany({
      where: { doseId: dose.id }
    });
    expect(fetchedLogs).toHaveLength(1);
    expect(fetchedLogs[0].action).toBe(DoseStatus.TAKEN);
    expect(fetchedLogs[0].actorUserId).toBe(user.id);

    // Appointment verified
    expect(fetchedProfile!.appointments).toHaveLength(1);
    expect(fetchedProfile!.appointments[0].doctor).toBe('Dr. Bruce Wayne');
    expect(fetchedProfile!.appointments[0].status).toBe(AppointmentStatus.SCHEDULED);

    // Caregiver Note verified
    const fetchedNotes = await freshPrisma.caregiverNote.findMany({
      where: { profileId: profile.id }
    });
    expect(fetchedNotes).toHaveLength(1);
    expect(fetchedNotes[0].note).toContain('118/76 mmHg');

    await freshPrisma.$disconnect();
  });
});
