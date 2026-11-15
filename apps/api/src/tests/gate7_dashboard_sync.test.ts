import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import app from '../app';
import { prisma } from '../db/prisma';
import { hashPassword, generateSessionId } from '../utils/crypto';
import { sseService } from '../services/sseService';
import { transitionDose } from '../services/doseStateMachine';

describe('Gate 7: Synchronized Dashboards & Real-Time SSE Propagation', () => {
  let server: http.Server;
  let serverPort: number;

  let ownerToken: string;
  let familyToken: string;
  let caregiverToken: string;
  let outsiderToken: string;

  let ownerUserId: string;
  let familyUserId: string;
  let caregiverUserId: string;
  let outsiderUserId: string;

  let profileId: string;
  let otherProfileId: string;
  let careNetworkId: string;
  let caregiverMemberId: string;

  let testMedicationId: string;
  let testScheduleId: string;
  let testDoseId: string;

  beforeAll(async () => {
    // Clear database tables
    await prisma.scheduledJob.deleteMany().catch(() => {});
    await prisma.caregiverNote.deleteMany().catch(() => {});
    await prisma.appointment.deleteMany().catch(() => {});
    await prisma.medicationLog.deleteMany().catch(() => {});
    await prisma.medicationDose.deleteMany().catch(() => {});
    await prisma.medicationSchedule.deleteMany().catch(() => {});
    await prisma.medication.deleteMany().catch(() => {});
    await prisma.auditLog.deleteMany().catch(() => {});
    await prisma.notification.deleteMany().catch(() => {});
    await prisma.invitation.deleteMany().catch(() => {});
    await prisma.careNetworkMember.deleteMany().catch(() => {});
    await prisma.careNetwork.deleteMany().catch(() => {});
    await prisma.elderlyProfile.deleteMany().catch(() => {});
    await prisma.session.deleteMany().catch(() => {});
    await prisma.recoveryCode.deleteMany().catch(() => {});
    await prisma.userSettings.deleteMany().catch(() => {});
    await prisma.user.deleteMany().catch(() => {});

    const commonHash = await hashPassword('Password123!');

    // 1. Create Users
    const owner = await prisma.user.create({
      data: { email: 'owner-g7@carebuddy.local', passwordHash: commonHash, name: 'Martha Stewart' }
    });
    ownerUserId = owner.id;

    const family = await prisma.user.create({
      data: { email: 'family-g7@carebuddy.local', passwordHash: commonHash, name: 'Bob Stewart' }
    });
    familyUserId = family.id;

    const caregiver = await prisma.user.create({
      data: { email: 'caregiver-g7@carebuddy.local', passwordHash: commonHash, name: 'Nurse Sarah' }
    });
    caregiverUserId = caregiver.id;

    const outsider = await prisma.user.create({
      data: { email: 'outsider-g7@carebuddy.local', passwordHash: commonHash, name: 'Outsider Dave' }
    });
    outsiderUserId = outsider.id;

    // 2. Create Sessions
    const makeSession = async (userId: string) => {
      const sid = generateSessionId();
      await prisma.session.create({
        data: {
          id: sid,
          userId,
          expiresAt: new Date(Date.now() + 86400000)
        }
      });
      return sid;
    };

    ownerToken = await makeSession(ownerUserId);
    familyToken = await makeSession(familyUserId);
    caregiverToken = await makeSession(caregiverUserId);
    outsiderToken = await makeSession(outsiderUserId);

    // 3. Create Elderly Profile & Care Network
    const profile = await prisma.elderlyProfile.create({
      data: {
        name: 'Martha Stewart',
        timezone: 'Asia/Kolkata',
        ownerMode: 'DIRECT',
        ownerUserId
      }
    });
    profileId = profile.id;

    const network = await prisma.careNetwork.create({
      data: { profileId }
    });
    careNetworkId = network.id;

    // Attach Owner, Family, and Caregiver
    await prisma.careNetworkMember.create({
      data: {
        careNetworkId,
        userId: ownerUserId,
        role: 'OWNER',
        status: 'ACTIVE',
        viewMedications: true,
        viewAdherence: true,
        viewAppointments: true,
        viewActivity: true,
        recordDoses: true,
        addNotes: true,
        manageMedications: true,
        manageAppointments: true,
        actOnBehalf: false
      }
    });

    await prisma.careNetworkMember.create({
      data: {
        careNetworkId,
        userId: familyUserId,
        role: 'FAMILY',
        status: 'ACTIVE',
        relationshipLabel: 'Son',
        viewMedications: true,
        viewAdherence: true,
        viewAppointments: true,
        viewActivity: true,
        recordDoses: false,
        addNotes: false,
        manageMedications: false,
        manageAppointments: false,
        actOnBehalf: false
      }
    });

    const cm = await prisma.careNetworkMember.create({
      data: {
        careNetworkId,
        userId: caregiverUserId,
        role: 'CAREGIVER',
        status: 'ACTIVE',
        relationshipLabel: 'Home Nurse',
        viewMedications: true,
        viewAdherence: true,
        viewAppointments: true,
        viewActivity: true,
        recordDoses: true,
        addNotes: true,
        manageMedications: false,
        manageAppointments: true,
        actOnBehalf: false
      }
    });
    caregiverMemberId = cm.id;

    // 4. Create an isolated profile B for cross-profile testing
    const profileB = await prisma.elderlyProfile.create({
      data: {
        name: 'Outsider Dave Senior',
        timezone: 'UTC',
        ownerMode: 'DIRECT',
        ownerUserId: outsiderUserId
      }
    });
    otherProfileId = profileB.id;

    const netB = await prisma.careNetwork.create({
      data: { profileId: otherProfileId }
    });
    await prisma.careNetworkMember.create({
      data: {
        careNetworkId: netB.id,
        userId: outsiderUserId,
        role: 'OWNER',
        status: 'ACTIVE'
      }
    });

    // 5. Create a medication & scheduled dose
    const med = await prisma.medication.create({
      data: {
        profileId,
        name: 'Metformin',
        strength: '500mg',
        dosage: '1 tablet',
        medicineType: 'TABLET',
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE'
      }
    });
    testMedicationId = med.id;

    const schedule = await prisma.medicationSchedule.create({
      data: {
        medicationId: testMedicationId,
        version: 1,
        frequency: 'ONCE_DAILY',
        timesOfDay: ['08:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        isActive: true
      }
    });
    testScheduleId = schedule.id;

    const dose = await prisma.medicationDose.create({
      data: {
        profileId,
        medicationId: testMedicationId,
        scheduleId: testScheduleId,
        scheduledAt: new Date(),
        localDate: '2026-11-15',
        localTime: '08:00',
        timezone: 'Asia/Kolkata',
        status: 'PENDING'
      }
    });
    testDoseId = dose.id;

    // Start ephemeral HTTP server for live SSE streaming tests
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests to the SSE event stream with 401', async () => {
    const res = await request(app).get(`/api/profiles/${profileId}/events`);
    expect(res.status).toBe(401);
  });

  it('rejects unauthorized users with 404 (IDOR defense)', async () => {
    const res = await request(app)
      .get(`/api/profiles/${profileId}/events`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it('successfully establishes SSE stream for authorized member with correct headers', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: `/api/profiles/${profileId}/events`,
          headers: {
            Authorization: `Bearer ${familyToken}`,
            Accept: 'text/event-stream'
          }
        },
        (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          expect(res.headers['cache-control']).toContain('no-cache');
          expect(res.headers['connection']).toContain('keep-alive');
          req.destroy();
          resolve();
        }
      );
      req.on('error', (err) => {
        if ((err as any).code === 'ECONNRESET') resolve();
        else reject(err);
      });
    });
  });

  it('connects 3 dashboards (elderly, family, caregiver) and propagates dose action within 2 seconds', async () => {
    const eventsElderly: any[] = [];
    const eventsFamily: any[] = [];
    const eventsCaregiver: any[] = [];

    const connectClient = (token: string, eventBucket: any[]): Promise<http.ClientRequest> => {
      return new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: `/api/profiles/${profileId}/events`,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream'
            }
          },
          (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const parsed = JSON.parse(line.slice(6));
                    eventBucket.push(parsed);
                  } catch {}
                }
              }
            });
            resolve(req);
          }
        );
        req.on('error', reject);
      });
    };

    // Connect all three dashboard streams simultaneously
    const reqElderly = await connectClient(ownerToken, eventsElderly);
    const reqFamily = await connectClient(familyToken, eventsFamily);
    const reqCaregiver = await connectClient(caregiverToken, eventsCaregiver);

    // Wait a brief moment for all 3 connections to be registered
    await new Promise((r) => setTimeout(r, 200));

    // Verify all 3 received the initial connected event
    expect(eventsElderly.some((e) => e.status === 'connected')).toBe(true);
    expect(eventsFamily.some((e) => e.status === 'connected')).toBe(true);
    expect(eventsCaregiver.some((e) => e.status === 'connected')).toBe(true);

    const startTime = Date.now();

    // Trigger a dose action from the Elderly/Owner session
    await transitionDose({
      doseId: testDoseId,
      targetState: 'TAKEN',
      actorUserId: ownerUserId,
      actionSource: 'OWNER_APP'
    });

    // Wait for event propagation (must be under 2000ms per Gate 7 SLA)
    let propagated = false;
    while (Date.now() - startTime < 2000) {
      const elderlyGotDose = eventsElderly.some((e) => e.type === 'DOSE_UPDATED' && e.entityId === testDoseId);
      const familyGotDose = eventsFamily.some((e) => e.type === 'DOSE_UPDATED' && e.entityId === testDoseId);
      const caregiverGotDose = eventsCaregiver.some((e) => e.type === 'DOSE_UPDATED' && e.entityId === testDoseId);

      if (elderlyGotDose && familyGotDose && caregiverGotDose) {
        propagated = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    const elapsed = Date.now() - startTime;
    expect(propagated).toBe(true);
    expect(elapsed).toBeLessThan(2000);

    // Invariant Check: Verify NO health data exists in any emitted SSE payload
    for (const event of [...eventsElderly, ...eventsFamily, ...eventsCaregiver]) {
      if (event.type === 'DOSE_UPDATED') {
        expect(event).toHaveProperty('type', 'DOSE_UPDATED');
        expect(event).toHaveProperty('profileId', profileId);
        expect(event).toHaveProperty('entityId', testDoseId);
        // Strict prohibition: health data must NOT be in the SSE payload!
        expect(event).not.toHaveProperty('medicationName');
        expect(event).not.toHaveProperty('dosage');
        expect(event).not.toHaveProperty('instructions');
        expect(event).not.toHaveProperty('status');
      }
    }

    // Clean up active connections
    reqElderly.destroy();
    reqFamily.destroy();
    reqCaregiver.destroy();
  });

  it('broadcasts APPOINTMENT_UPDATED and NOTE_ADDED events to connected clients', async () => {
    const receivedEvents: any[] = [];

    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: `/api/profiles/${profileId}/events`,
        headers: {
          Authorization: `Bearer ${caregiverToken}`,
          Accept: 'text/event-stream'
        }
      },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                receivedEvents.push(JSON.parse(line.slice(6)));
              } catch {}
            }
          }
        });
      }
    );

    await new Promise((r) => setTimeout(r, 200));

    // 1. Create Note via API
    const noteRes = await request(app)
      .post(`/api/profiles/${profileId}/notes`)
      .set('Authorization', `Bearer ${caregiverToken}`)
      .send({ note: 'Blood pressure 120/80 mmHg, patient feeling great.', isFlagged: false });
    expect(noteRes.status).toBe(201);
    const noteId = noteRes.body.id;

    // 2. Create Appointment via API
    const aptRes = await request(app)
      .post(`/api/profiles/${profileId}/appointments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        doctor: 'Dr. Jane Watson',
        clinic: 'Cardio Specialists',
        localDate: '2026-11-25',
        localTime: '10:00'
      });
    expect(aptRes.status).toBe(201);
    const appointmentId = aptRes.body.id;

    // Wait up to 1 second for SSE events
    await new Promise((r) => setTimeout(r, 400));

    const noteEvent = receivedEvents.find((e) => e.type === 'NOTE_ADDED' && e.entityId === noteId);
    expect(noteEvent).toBeDefined();
    expect(noteEvent.profileId).toBe(profileId);
    // Security check: note text never in SSE payload
    expect(noteEvent.note).toBeUndefined();
    expect(noteEvent.content).toBeUndefined();

    const aptEvent = receivedEvents.find((e) => e.type === 'APPOINTMENT_UPDATED' && e.entityId === appointmentId);
    expect(aptEvent).toBeDefined();
    expect(aptEvent.profileId).toBe(profileId);
    // Security check: clinic/doctor never in SSE payload
    expect(aptEvent.doctor).toBeUndefined();
    expect(aptEvent.clinic).toBeUndefined();

    req.destroy();
  });

  it('immediately closes SSE connections when a member is revoked or removed', async () => {
    let clientDisconnected = false;

    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: `/api/profiles/${profileId}/events`,
        headers: {
          Authorization: `Bearer ${caregiverToken}`,
          Accept: 'text/event-stream'
        }
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          clientDisconnected = true;
        });
        res.on('close', () => {
          clientDisconnected = true;
        });
      }
    );

    await new Promise((r) => setTimeout(r, 200));

    // Owner revokes caregiver membership
    const revokeRes = await request(app)
      .delete(`/api/profiles/${profileId}/care-network/${caregiverMemberId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(revokeRes.status).toBe(200);

    // Wait up to 1000ms for connection termination
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      if (clientDisconnected) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(clientDisconnected).toBe(true);

    req.destroy();
  });

  it('guarantees cross-profile isolation: events in Profile A are never delivered to Profile B', async () => {
    const otherProfileEvents: any[] = [];
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path: `/api/profiles/${otherProfileId}/events`,
        headers: {
          Authorization: `Bearer ${outsiderToken}`,
          Accept: 'text/event-stream'
        }
      },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                otherProfileEvents.push(JSON.parse(line.slice(6)));
              } catch {}
            }
          }
        });
      }
    );

    await new Promise((r) => setTimeout(r, 200));

    // Broadcast an event strictly on profileId A
    sseService.broadcastEvent({
      type: 'DOSE_UPDATED',
      profileId,
      entityId: 'isolated-dose-999'
    });

    await new Promise((r) => setTimeout(r, 300));

    // Verify otherProfile received ZERO events from profileId
    const crossLeak = otherProfileEvents.some((e) => e.entityId === 'isolated-dose-999');
    expect(crossLeak).toBe(false);

    req.destroy();
  });
});
