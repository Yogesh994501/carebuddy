import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../db/prisma';
import { seedDemoData, DEMO_USERS } from '../services/demoService';
import argon2 from 'argon2';

describe('Gate 10: Demo Reliability & Non-Demo Data Isolation', () => {
  beforeAll(async () => {
    // Initial seed
    await seedDemoData(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. seeds deterministic fictional demo data and verifies all 4 roles can authenticate', async () => {
    const roles = [
      DEMO_USERS.elderly,
      DEMO_USERS.familyPriya,
      DEMO_USERS.familyRahul,
      DEMO_USERS.caregiverAnita
    ];

    for (const demoAccount of roles) {
      const user = await prisma.user.findUnique({
        where: { email: demoAccount.email }
      });
      expect(user).not.toBeNull();
      expect(user!.name).toBe(demoAccount.name);

      // Verify Argon2id password authentication
      const valid = await argon2.verify(user!.passwordHash, demoAccount.password);
      expect(valid).toBe(true);

      // Test login via HTTP endpoint
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: demoAccount.email,
          password: demoAccount.password
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(demoAccount.email);
      expect(res.headers['set-cookie']).toBeDefined();
    }
  });

  it('2. verifies 5 medications, 3 upcoming appointments, and 30-day realistic adherence', async () => {
    const demoProfile = await prisma.elderlyProfile.findFirst({
      where: { isDemo: true },
      include: {
        medications: true,
        appointments: true,
        doses: true,
        careNetwork: {
          include: { members: true }
        }
      }
    });

    expect(demoProfile).not.toBeNull();
    expect(demoProfile!.name).toBe('Ramesh Patel');
    expect(demoProfile!.timezone).toBe('Asia/Kolkata');
    expect(demoProfile!.isDemo).toBe(true);

    // 5 active medications
    expect(demoProfile!.medications).toHaveLength(5);
    const medNames = demoProfile!.medications.map(m => m.name);
    expect(medNames).toContain('Amlodipine');
    expect(medNames).toContain('Metformin HCl');
    expect(medNames).toContain('Atorvastatin');
    expect(medNames).toContain('Pantoprazole');
    expect(medNames).toContain('Elderly Multivitamin & Zinc');

    // 3 upcoming appointments
    expect(demoProfile!.appointments).toHaveLength(3);
    const aptDoctors = demoProfile!.appointments.map(a => a.doctor);
    expect(aptDoctors).toContain('Dr. Rajesh Mehta');
    expect(aptDoctors).toContain('Dr. Neha Joshi');
    expect(aptDoctors).toContain('Dr. Sunita Rao');

    // Care network contains Priya, Rahul, and Anita
    expect(demoProfile!.careNetwork?.members).toHaveLength(3);

    // 30 days of doses with ~90% adherence
    const doses = demoProfile!.doses;
    expect(doses.length).toBeGreaterThan(100);

    const takenCount = doses.filter(d => d.status === 'TAKEN').length;
    const skippedCount = doses.filter(d => d.status === 'SKIPPED').length;
    const missedCount = doses.filter(d => d.status === 'MISSED').length;
    const actedCount = takenCount + skippedCount + missedCount;

    expect(actedCount).toBeGreaterThan(0);
    const adherenceRate = Math.round((takenCount / actedCount) * 100);
    // Adherence rate is realistic: between 80% and 95%
    expect(adherenceRate).toBeGreaterThanOrEqual(80);
    expect(adherenceRate).toBeLessThanOrEqual(95);
  });

  it('3. isolates non-demo records and survives reset twice without data loss', async () => {
    // Create a real non-demo user and profile
    const nonDemoEmail = `real-doctor-${Date.now()}@hospital.org`;
    const nonDemoUser = await prisma.user.create({
      data: {
        email: nonDemoEmail,
        name: 'Dr. Evelyn Reed',
        passwordHash: await argon2.hash('RealSecretPassword99!')
      }
    });

    const nonDemoProfile = await prisma.elderlyProfile.create({
      data: {
        ownerUserId: nonDemoUser.id,
        name: 'Arthur Pendelton',
        timezone: 'America/Chicago',
        isDemo: false
      }
    });

    const nonDemoMed = await prisma.medication.create({
      data: {
        profileId: nonDemoProfile.id,
        name: 'Metoprolol Succinate',
        strength: '25 mg',
        dosage: '1 tablet',
        medicineType: 'Tablet',
        startDate: new Date()
      }
    });

    // Reset demo 1st time via HTTP API
    const reset1 = await request(app).post('/api/demo/reset');
    expect(reset1.status).toBe(200);
    expect(reset1.body.success).toBe(true);

    // Reset demo 2nd time to verify idempotency
    const reset2 = await request(app).post('/api/demo/reset');
    expect(reset2.status).toBe(200);
    expect(reset2.body.success).toBe(true);

    // Verify non-demo user and profile are completely untouched
    const preservedUser = await prisma.user.findUnique({
      where: { email: nonDemoEmail }
    });
    expect(preservedUser).not.toBeNull();
    expect(preservedUser!.name).toBe('Dr. Evelyn Reed');

    const preservedProfile = await prisma.elderlyProfile.findUnique({
      where: { id: nonDemoProfile.id },
      include: { medications: true }
    });
    expect(preservedProfile).not.toBeNull();
    expect(preservedProfile!.name).toBe('Arthur Pendelton');
    expect(preservedProfile!.isDemo).toBe(false);
    expect(preservedProfile!.medications).toHaveLength(1);
    expect(preservedProfile!.medications[0].name).toBe('Metoprolol Succinate');

    // Clean up non-demo test record
    await prisma.medication.delete({ where: { id: nonDemoMed.id } });
    await prisma.elderlyProfile.delete({ where: { id: nonDemoProfile.id } });
    await prisma.user.delete({ where: { id: nonDemoUser.id } });
  });
});
