import { PrismaClient, NetworkRole, ScheduleFrequency, DoseStatus, DoseActionSource, AppointmentStatus } from '@prisma/client';
import argon2 from 'argon2';
import { DateTime } from 'luxon';

export const DEMO_USERS = {
  elderly: {
    email: 'ramesh@demo.carebuddy.local',
    name: 'Ramesh Patel',
    password: 'DemoPassword123!',
    role: NetworkRole.OWNER
  },
  familyPriya: {
    email: 'priya@demo.carebuddy.local',
    name: 'Priya Patel',
    password: 'DemoPassword123!',
    role: NetworkRole.FAMILY
  },
  familyRahul: {
    email: 'rahul@demo.carebuddy.local',
    name: 'Rahul Patel',
    password: 'DemoPassword123!',
    role: NetworkRole.FAMILY
  },
  caregiverAnita: {
    email: 'anita@demo.carebuddy.local',
    name: 'Anita Sharma, RN',
    password: 'DemoPassword123!',
    role: NetworkRole.CAREGIVER
  }
};

export async function clearDemoData(prisma: PrismaClient) {
  // Find all demo profiles
  const demoProfiles = await prisma.elderlyProfile.findMany({
    where: { isDemo: true },
    select: { id: true }
  });
  const demoProfileIds = demoProfiles.map(p => p.id);

  // Find demo users
  const demoUsers = await prisma.user.findMany({
    where: {
      email: {
        in: [
          DEMO_USERS.elderly.email,
          DEMO_USERS.familyPriya.email,
          DEMO_USERS.familyRahul.email,
          DEMO_USERS.caregiverAnita.email
        ]
      }
    },
    select: { id: true }
  });
  const demoUserIds = demoUsers.map(u => u.id);

  // Temporarily disable user-defined immutability triggers for administrative demo reset
  await prisma.$executeRawUnsafe(`ALTER TABLE "MedicationLog" DISABLE TRIGGER trg_medication_log_immutable;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" DISABLE TRIGGER trg_audit_log_immutable;`);

  try {
    if (demoProfileIds.length > 0) {
      await prisma.assistantMessage.deleteMany({
        where: { profileId: { in: demoProfileIds } }
      });

      await prisma.caregiverNote.deleteMany({
        where: { profileId: { in: demoProfileIds } }
      });

      await prisma.appointment.deleteMany({
        where: { profileId: { in: demoProfileIds } }
      });

      await prisma.$executeRawUnsafe(
        `DELETE FROM "MedicationLog" WHERE "profileId" = ANY($1)`,
        demoProfileIds
      );

      await prisma.medicationDose.deleteMany({
        where: { profileId: { in: demoProfileIds } }
      });

      await prisma.medicationSchedule.deleteMany({
        where: {
          medication: {
            profileId: { in: demoProfileIds }
          }
        }
      });

      await prisma.medication.deleteMany({
        where: { profileId: { in: demoProfileIds } }
      });

      const networks = await prisma.careNetwork.findMany({
        where: { profileId: { in: demoProfileIds } },
        select: { id: true }
      });
      const networkIds = networks.map(n => n.id);

      if (networkIds.length > 0) {
        await prisma.careNetworkMember.deleteMany({
          where: { careNetworkId: { in: networkIds } }
        });

        await prisma.invitation.deleteMany({
          where: { careNetworkId: { in: networkIds } }
        });
      }

      await prisma.careNetwork.deleteMany({
        where: { profileId: { in: demoProfileIds } }
      });

      await prisma.$executeRawUnsafe(
        `DELETE FROM "AuditLog" WHERE "profileId" = ANY($1)`,
        demoProfileIds
      );

      await prisma.elderlyProfile.deleteMany({
        where: { id: { in: demoProfileIds } }
      });
    }

    if (demoUserIds.length > 0) {
      await prisma.session.deleteMany({
        where: { userId: { in: demoUserIds } }
      });

      await prisma.recoveryCode.deleteMany({
        where: { userId: { in: demoUserIds } }
      });

      await prisma.consentRecord.deleteMany({
        where: { userId: { in: demoUserIds } }
      });

      await prisma.userSettings.deleteMany({
        where: { userId: { in: demoUserIds } }
      });

      await prisma.notification.deleteMany({
        where: { recipientId: { in: demoUserIds } }
      });

      await prisma.$executeRawUnsafe(
        `DELETE FROM "AuditLog" WHERE "userId" = ANY($1)`,
        demoUserIds
      );

      await prisma.user.deleteMany({
        where: { id: { in: demoUserIds } }
      });
    }
  } finally {
    // Always re-enable triggers
    await prisma.$executeRawUnsafe(`ALTER TABLE "MedicationLog" ENABLE TRIGGER trg_medication_log_immutable;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "AuditLog" ENABLE TRIGGER trg_audit_log_immutable;`);
  }
}

export async function seedDemoData(prisma: PrismaClient) {
  // Clear existing demo data first to guarantee idempotency
  await clearDemoData(prisma);

  const passwordHash = await argon2.hash('DemoPassword123!');

  // 1. Create Demo Users
  const elderlyUser = await prisma.user.create({
    data: {
      email: DEMO_USERS.elderly.email,
      name: DEMO_USERS.elderly.name,
      passwordHash
    }
  });

  const familyPriya = await prisma.user.create({
    data: {
      email: DEMO_USERS.familyPriya.email,
      name: DEMO_USERS.familyPriya.name,
      passwordHash
    }
  });

  const familyRahul = await prisma.user.create({
    data: {
      email: DEMO_USERS.familyRahul.email,
      name: DEMO_USERS.familyRahul.name,
      passwordHash
    }
  });

  const caregiverAnita = await prisma.user.create({
    data: {
      email: DEMO_USERS.caregiverAnita.email,
      name: DEMO_USERS.caregiverAnita.name,
      passwordHash
    }
  });

  // 2. Create Elderly Profile for Ramesh Patel
  const timezone = 'Asia/Kolkata';
  const profile = await prisma.elderlyProfile.create({
    data: {
      ownerUserId: elderlyUser.id,
      name: 'Ramesh Patel',
      preferredName: 'Ramesh-ji',
      dateOfBirth: new Date('1952-08-15'),
      bloodGroup: 'B+',
      allergies: 'Penicillin (mild rash)',
      emergencyNotes: 'Hypertension and Type 2 Diabetes; wears bifocal spectacles.',
      timezone,
      reminderLeadMinutes: 15,
      overdueGraceMinutes: 60,
      snoozeDurationMinutes: 10,
      maxSnoozeCount: 3,
      aiConsent: true,
      isDemo: true
    }
  });

  // 3. Create Care Network & Memberships
  const careNetwork = await prisma.careNetwork.create({
    data: {
      profileId: profile.id
    }
  });

  // Priya (Family Daughter)
  await prisma.careNetworkMember.create({
    data: {
      careNetworkId: careNetwork.id,
      userId: familyPriya.id,
      role: NetworkRole.FAMILY,
      relationshipLabel: 'Daughter',
      viewMedications: true,
      recordDoses: false,
      manageMedications: false,
      viewAppointments: true,
      manageAppointments: false,
      addNotes: false,
      viewAdherence: true,
      viewActivity: true
    }
  });

  // Rahul (Family Son)
  await prisma.careNetworkMember.create({
    data: {
      careNetworkId: careNetwork.id,
      userId: familyRahul.id,
      role: NetworkRole.FAMILY,
      relationshipLabel: 'Son',
      viewMedications: true,
      recordDoses: false,
      manageMedications: false,
      viewAppointments: true,
      manageAppointments: false,
      addNotes: false,
      viewAdherence: true,
      viewActivity: true
    }
  });

  // Anita (Registered Nurse & Primary Caregiver)
  await prisma.careNetworkMember.create({
    data: {
      careNetworkId: careNetwork.id,
      userId: caregiverAnita.id,
      role: NetworkRole.CAREGIVER,
      relationshipLabel: 'Home Care Nurse',
      viewMedications: true,
      recordDoses: true,
      manageMedications: true,
      viewAppointments: true,
      manageAppointments: true,
      addNotes: true,
      viewAdherence: true,
      viewActivity: true
    }
  });

  // 4. Create 5 Realistic Medications with MedicationSchedule
  const startDate = DateTime.now().setZone(timezone).minus({ days: 30 }).startOf('day').toJSDate();

  const medConfigs = [
    {
      name: 'Amlodipine',
      strength: '5 mg',
      dosage: '1 tablet',
      medicineType: 'Tablet',
      instructions: 'Take 1 tablet daily in the morning with water for blood pressure.',
      prescriber: 'Dr. Rajesh Mehta',
      frequency: ScheduleFrequency.ONCE_DAILY,
      timesOfDay: ['08:00']
    },
    {
      name: 'Metformin HCl',
      strength: '500 mg',
      dosage: '1 tablet',
      medicineType: 'Tablet',
      instructions: 'Take 1 tablet twice daily with morning and evening meals.',
      prescriber: 'Dr. Neha Joshi',
      frequency: ScheduleFrequency.TWICE_DAILY,
      timesOfDay: ['08:00', '20:00']
    },
    {
      name: 'Atorvastatin',
      strength: '20 mg',
      dosage: '1 tablet',
      medicineType: 'Tablet',
      instructions: 'Take 1 tablet at night before bedtime.',
      prescriber: 'Dr. Rajesh Mehta',
      frequency: ScheduleFrequency.ONCE_DAILY,
      timesOfDay: ['21:00']
    },
    {
      name: 'Pantoprazole',
      strength: '40 mg',
      dosage: '1 capsule',
      medicineType: 'Capsule',
      instructions: 'Take 1 capsule on an empty stomach 30 minutes before breakfast.',
      prescriber: 'Dr. Neha Joshi',
      frequency: ScheduleFrequency.ONCE_DAILY,
      timesOfDay: ['07:30']
    },
    {
      name: 'Elderly Multivitamin & Zinc',
      strength: '1 Tablet',
      dosage: '1 tablet',
      medicineType: 'Tablet',
      instructions: 'Take 1 tablet daily with mid-morning tea or water.',
      prescriber: 'Dr. Ramesh Rao',
      frequency: ScheduleFrequency.ONCE_DAILY,
      timesOfDay: ['10:00']
    }
  ];

  const seededMeds: Array<{ id: string; name: string; scheduleId: string; timesOfDay: string[] }> = [];

  for (const config of medConfigs) {
    const med = await prisma.medication.create({
      data: {
        profileId: profile.id,
        name: config.name,
        strength: config.strength,
        dosage: config.dosage,
        medicineType: config.medicineType,
        instructions: config.instructions,
        prescriber: config.prescriber,
        startDate
      }
    });

    const sched = await prisma.medicationSchedule.create({
      data: {
        medicationId: med.id,
        frequency: config.frequency,
        timesOfDay: config.timesOfDay,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        isActive: true
      }
    });

    seededMeds.push({
      id: med.id,
      name: med.name,
      scheduleId: sched.id,
      timesOfDay: config.timesOfDay
    });
  }

  // 5. Generate 30 Days of Historical Doses with High Realistic Adherence (~90%)
  const now = DateTime.now().setZone(timezone);

  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const currentDay = now.minus({ days: dayOffset });
    const localDate = currentDay.toFormat('yyyy-MM-dd');

    for (const med of seededMeds) {
      for (const timeStr of med.timesOfDay) {
        const [hour, minute] = timeStr.split(':').map(Number);
        const scheduledDt = currentDay.set({ hour, minute, second: 0, millisecond: 0 });
        const scheduledAt = scheduledDt.toJSDate();

        // Past doses
        if (scheduledDt < now.minus({ hours: 1 })) {
          const hashVal = (dayOffset * 17 + hour * 13 + med.name.length * 7) % 100;

          let status: DoseStatus;
          let actionSource: DoseActionSource;
          let takenAt: Date | null = null;
          let skipReason: string | null = null;

          if (hashVal < 88) {
            status = DoseStatus.TAKEN;
            actionSource = hashVal % 3 === 0 ? DoseActionSource.CAREGIVER_APP : DoseActionSource.OWNER_APP;
            takenAt = scheduledDt.plus({ minutes: (hashVal % 20) + 2 }).toJSDate();
          } else if (hashVal < 96) {
            status = DoseStatus.SKIPPED;
            actionSource = DoseActionSource.OWNER_APP;
            skipReason = hashVal % 2 === 0 ? 'Felt mild stomach fullness' : 'Doctor advised temporary pause';
          } else {
            status = DoseStatus.MISSED;
            actionSource = DoseActionSource.SYSTEM_WORKER;
          }

          const dose = await prisma.medicationDose.create({
            data: {
              profileId: profile.id,
              medicationId: med.id,
              scheduleId: med.scheduleId,
              localDate,
              localTime: timeStr,
              scheduledAt,
              timezone,
              status,
              takenAt,
              actionSource,
              skipReason
            }
          });

          // Immutable medication log for audit
          await prisma.medicationLog.create({
            data: {
              doseId: dose.id,
              medicationId: med.id,
              profileId: profile.id,
              actorUserId: actionSource === DoseActionSource.CAREGIVER_APP ? caregiverAnita.id : elderlyUser.id,
              action: status,
              actionSource,
              newState: status,
              timestamp: takenAt || scheduledAt,
              reason: skipReason
            }
          });
        } else {
          // Today's upcoming or pending dose
          await prisma.medicationDose.create({
            data: {
              profileId: profile.id,
              medicationId: med.id,
              scheduleId: med.scheduleId,
              localDate,
              localTime: timeStr,
              scheduledAt,
              timezone,
              status: DoseStatus.PENDING
            }
          });
        }
      }
    }
  }

  // 6. Create 3 Upcoming Medical Appointments
  const nextWeekTuesday = now.plus({ days: 3 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  await prisma.appointment.create({
    data: {
      profileId: profile.id,
      doctor: 'Dr. Rajesh Mehta',
      specialty: 'Cardiologist',
      clinic: 'Apollo Heart Centre, Suite 304',
      scheduledAt: nextWeekTuesday.toJSDate(),
      localDate: nextWeekTuesday.toFormat('yyyy-MM-dd'),
      localTime: '10:00',
      reason: 'Routine quarterly blood pressure review and 12-lead ECG monitor check.',
      status: AppointmentStatus.SCHEDULED,
      createdById: elderlyUser.id
    }
  });

  const nextWeekFriday = now.plus({ days: 7 }).set({ hour: 8, minute: 30, second: 0, millisecond: 0 });
  await prisma.appointment.create({
    data: {
      profileId: profile.id,
      doctor: 'Dr. Neha Joshi',
      specialty: 'Endocrinologist',
      clinic: 'Max Diagnostic Laboratories',
      scheduledAt: nextWeekFriday.toJSDate(),
      localDate: nextWeekFriday.toFormat('yyyy-MM-dd'),
      localTime: '08:30',
      reason: 'Fasting blood glucose, lipid profile, and 3-month HbA1c assessment.',
      status: AppointmentStatus.SCHEDULED,
      createdById: elderlyUser.id
    }
  });

  const twoWeeksLater = now.plus({ days: 14 }).set({ hour: 16, minute: 0, second: 0, millisecond: 0 });
  await prisma.appointment.create({
    data: {
      profileId: profile.id,
      doctor: 'Dr. Sunita Rao',
      specialty: 'Ophthalmologist',
      clinic: 'Netra Eye Care Hospital',
      scheduledAt: twoWeeksLater.toJSDate(),
      localDate: twoWeeksLater.toFormat('yyyy-MM-dd'),
      localTime: '16:00',
      reason: 'Diabetic retinopathy screening and bifocal vision prescription update.',
      status: AppointmentStatus.SCHEDULED,
      createdById: elderlyUser.id
    }
  });

  // 7. Create Recent Caregiver Notes
  await prisma.caregiverNote.create({
    data: {
      profileId: profile.id,
      authorUserId: caregiverAnita.id,
      note: 'Morning wellness check completed. Vitals: Blood pressure 122/80 mmHg, Heart rate 72 bpm. Ramesh-ji had whole grain oats and completed his morning medications without issue.',
      createdAt: now.minus({ hours: 4 }).toJSDate()
    }
  });

  await prisma.caregiverNote.create({
    data: {
      profileId: profile.id,
      authorUserId: caregiverAnita.id,
      note: 'Refilled Amlodipine and Metformin from Apollo Pharmacy. New strips checked against prescription dosage.',
      createdAt: now.minus({ days: 1, hours: 2 }).toJSDate()
    }
  });

  return {
    profileId: profile.id,
    demoUsers: DEMO_USERS,
    medicationCount: seededMeds.length,
    appointmentCount: 3
  };
}
