import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../db/prisma';
import { hashPassword, generateSessionId } from '../utils/crypto';

describe('Gate 5: Backend Permissions Matrix & Authorization', () => {
  let ownerToken: string;
  let familyToken: string;
  let caregiverToken: string;
  let otherUserToken: string;
  let revokedMemberToken: string;
  let targetRevokeToken: string;

  let ownerUserId: string;
  let familyUserId: string;
  let caregiverUserId: string;
  let otherUserId: string;
  let targetRevokeUserId: string;

  let profileAId: string;
  let careNetworkAId: string;
  let profileBId: string;

  let targetRevMemId: string;
  let createdAppointmentId: string;
  let caregiverNoteId: string;
  let ownerNotificationId: string;

  beforeAll(async () => {
    // Clean test database tables
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
      data: { email: 'owner@carebuddy.local', passwordHash: commonHash, name: 'Alice Owner' }
    });
    ownerUserId = owner.id;

    const family = await prisma.user.create({
      data: { email: 'family@carebuddy.local', passwordHash: commonHash, name: 'Bob Family' }
    });
    familyUserId = family.id;

    const caregiver = await prisma.user.create({
      data: { email: 'caregiver@carebuddy.local', passwordHash: commonHash, name: 'Carol Caregiver' }
    });
    caregiverUserId = caregiver.id;

    const otherUser = await prisma.user.create({
      data: { email: 'other@carebuddy.local', passwordHash: commonHash, name: 'Dan Other' }
    });
    otherUserId = otherUser.id;

    const targetRevoke = await prisma.user.create({
      data: { email: 'target-revoke@carebuddy.local', passwordHash: commonHash, name: 'Eve TargetRevoke' }
    });
    targetRevokeUserId = targetRevoke.id;

    // 2. Create Sessions
    const makeSession = async (userId: string) => {
      const id = generateSessionId();
      await prisma.session.create({
        data: {
          id,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
      return id;
    };

    ownerToken = await makeSession(ownerUserId);
    familyToken = await makeSession(familyUserId);
    caregiverToken = await makeSession(caregiverUserId);
    otherUserToken = await makeSession(otherUserId);
    targetRevokeToken = await makeSession(targetRevokeUserId);

    // 3. Create Profile A and CareNetwork A
    const profileA = await prisma.elderlyProfile.create({
      data: {
        name: 'Grandma Rose',
        timezone: 'Asia/Kolkata',
        ownerMode: 'DIRECT',
        ownerUserId: ownerUserId
      }
    });
    profileAId = profileA.id;

    const networkA = await prisma.careNetwork.create({
      data: { profileId: profileAId }
    });
    careNetworkAId = networkA.id;

    // Attach Owner to Network A
    await prisma.careNetworkMember.create({
      data: {
        careNetworkId: careNetworkAId,
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

    // Attach Family to Network A (Defaults: view flags on, management/notes/record off)
    await prisma.careNetworkMember.create({
      data: {
        careNetworkId: careNetworkAId,
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

    // Attach Caregiver to Network A (Defaults: view on, addNotes on, recordDoses on, management off)
    await prisma.careNetworkMember.create({
      data: {
        careNetworkId: careNetworkAId,
        userId: caregiverUserId,
        role: 'CAREGIVER',
        status: 'ACTIVE',
        relationshipLabel: 'Primary Nurse',
        viewMedications: true,
        viewAdherence: true,
        viewAppointments: true,
        viewActivity: true,
        recordDoses: true,
        addNotes: true,
        manageMedications: false,
        manageAppointments: false,
        actOnBehalf: false
      }
    });

    // Attach Target Revoke User to Network A (will be revoked in real-time test)
    const targetMem = await prisma.careNetworkMember.create({
      data: {
        careNetworkId: careNetworkAId,
        userId: targetRevokeUserId,
        role: 'FAMILY',
        status: 'ACTIVE',
        relationshipLabel: 'Temporary Member',
        viewMedications: true
      }
    });
    targetRevMemId = targetMem.id;

    // 4. Create Profile B for Other User
    const profileB = await prisma.elderlyProfile.create({
      data: {
        name: 'Grandpa George',
        timezone: 'Asia/Kolkata',
        ownerUserId: otherUserId
      }
    });
    profileBId = profileB.id;

    const networkB = await prisma.careNetwork.create({
      data: { profileId: profileBId }
    });

    await prisma.careNetworkMember.create({
      data: {
        careNetworkId: networkB.id,
        userId: otherUserId,
        role: 'OWNER',
        status: 'ACTIVE'
      }
    });

    // 5. Create a test notification for owner
    const notif = await prisma.notification.create({
      data: {
        profileId: profileAId,
        recipientId: ownerUserId,
        type: 'DOSE_UPCOMING',
        title: 'Take Aspirin',
        message: 'Scheduled dose at 09:00',
        idempotencyKey: `init-test-notif-${Date.now()}`
      }
    });
    ownerNotificationId = notif.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Unauthenticated (Anonymous) Access', () => {
    it('rejects GET /api/profiles with 401', async () => {
      const res = await request(app).get('/api/profiles');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects GET /api/profiles/:profileId with 401', async () => {
      const res = await request(app).get(`/api/profiles/${profileAId}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects POST /api/profiles with 401', async () => {
      const res = await request(app).post('/api/profiles').send({ name: 'Anon Profile' });
      expect(res.status).toBe(401);
    });
  });

  describe('2. Cross-Profile ID Guessing (IDOR Defense)', () => {
    it('returns 404 (not 403) when user accesses a profile they do not belong to', async () => {
      const res = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('returns 404 when user guesses non-existent profile ID', async () => {
      const res = await request(app)
        .get('/api/profiles/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
    });
  });

  describe('3. Core Care Network & Profile Permissions', () => {
    it('GET /api/profiles/:profileId - Owner, Family, Caregiver get 200', async () => {
      const resOwner = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.membership.role).toBe('OWNER');

      const resFamily = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(200);
      expect(resFamily.body.membership.role).toBe('FAMILY');

      const resCaregiver = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(resCaregiver.status).toBe(200);
      expect(resCaregiver.body.membership.role).toBe('CAREGIVER');
    });

    it('PATCH /api/profiles/:profileId - Only Owner can update timezone/reminder settings', async () => {
      const resFamily = await request(app)
        .patch(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${familyToken}`)
        .send({ timezone: 'Europe/London' });
      expect(resFamily.status).toBe(403);
      expect(resFamily.body.error.code).toBe('OWNER_PERMISSION_REQUIRED');

      const resCaregiver = await request(app)
        .patch(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ reminderLeadMinutes: 30 });
      expect(resCaregiver.status).toBe(403);

      const resOwner = await request(app)
        .patch(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reminderLeadMinutes: 20 });
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.profile.reminderLeadMinutes).toBe(20);
    });

    it('POST /api/profiles/:profileId/invitations - Only Owner can invite', async () => {
      const resFamily = await request(app)
        .post(`/api/profiles/${profileAId}/invitations`)
        .set('Authorization', `Bearer ${familyToken}`)
        .send({ role: 'FAMILY', relationshipLabel: 'Sister' });
      expect(resFamily.status).toBe(403);

      const resCaregiver = await request(app)
        .post(`/api/profiles/${profileAId}/invitations`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ role: 'CAREGIVER' });
      expect(resCaregiver.status).toBe(403);

      const resOwner = await request(app)
        .post(`/api/profiles/${profileAId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'CAREGIVER', relationshipLabel: 'Night Nurse' });
      expect(resOwner.status).toBe(201);
      expect(resOwner.body.code).toBeDefined();
      expect(resOwner.body.code.length).toBe(10);
    });

    it('GET /api/profiles/:profileId/audit - Only Owner sees full audit log', async () => {
      const resFamily = await request(app)
        .get(`/api/profiles/${profileAId}/audit`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(403);

      const resCaregiver = await request(app)
        .get(`/api/profiles/${profileAId}/audit`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(resCaregiver.status).toBe(403);

      const resOwner = await request(app)
        .get(`/api/profiles/${profileAId}/audit`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
      expect(Array.isArray(resOwner.body.auditLogs)).toBe(true);
    });
  });

  describe('4. Appointments Permissions Matrix (Stage 5)', () => {
    it('POST /appointments - Owner creates appointment; Family and Caregiver rejected (manageAppointments: false)', async () => {
      const aptPayload = {
        doctor: 'Dr. Sarah Connor',
        specialty: 'Cardiology',
        clinic: 'Heart Care Center',
        localDate: '2026-11-20',
        localTime: '10:30',
        reason: 'Routine checkup'
      };

      // 1. Family rejected (403)
      const resFamily = await request(app)
        .post(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${familyToken}`)
        .send(aptPayload);
      expect(resFamily.status).toBe(403);
      expect(resFamily.body.error.code).toBe('FORBIDDEN');

      // 2. Caregiver rejected (403)
      const resCaregiver = await request(app)
        .post(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send(aptPayload);
      expect(resCaregiver.status).toBe(403);

      // 3. Cross-profile rejected with 404 (IDOR)
      const resOther = await request(app)
        .post(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send(aptPayload);
      expect(resOther.status).toBe(404);

      // 4. Anonymous rejected with 401
      const resAnon = await request(app)
        .post(`/api/profiles/${profileAId}/appointments`)
        .send(aptPayload);
      expect(resAnon.status).toBe(401);

      // 5. Owner creates appointment successfully (201)
      const resOwner = await request(app)
        .post(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(aptPayload);
      expect(resOwner.status).toBe(201);
      expect(resOwner.body.id).toBeDefined();
      expect(resOwner.body.doctor).toBe('Dr. Sarah Connor');
      createdAppointmentId = resOwner.body.id;

      // Verify 24h & 2h reminder background jobs were scheduled
      const jobs = await prisma.scheduledJob.findMany({
        where: {
          profileId: profileAId,
          type: 'APPOINTMENT_REMINDER'
        }
      });
      expect(jobs.length).toBe(2);
    });

    it('GET /appointments - Owner, Family, Caregiver get 200 (viewAppointments: true)', async () => {
      const resOwner = await request(app)
        .get(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
      expect(Array.isArray(resOwner.body)).toBe(true);

      const resFamily = await request(app)
        .get(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(200);

      const resCaregiver = await request(app)
        .get(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(resCaregiver.status).toBe(200);

      // Cross-profile rejected with 404
      const resOther = await request(app)
        .get(`/api/profiles/${profileAId}/appointments`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(resOther.status).toBe(404);
    });

    it('POST /appointments/:id/reschedule - Owner can reschedule; Family & Caregiver rejected', async () => {
      const resFamily = await request(app)
        .post(`/api/profiles/${profileAId}/appointments/${createdAppointmentId}/reschedule`)
        .set('Authorization', `Bearer ${familyToken}`)
        .send({ localDate: '2026-11-21', localTime: '11:00', reason: 'Rescheduled by doctor' });
      expect(resFamily.status).toBe(403);

      const resCaregiver = await request(app)
        .post(`/api/profiles/${profileAId}/appointments/${createdAppointmentId}/reschedule`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ localDate: '2026-11-21', localTime: '11:00' });
      expect(resCaregiver.status).toBe(403);

      const resOwner = await request(app)
        .post(`/api/profiles/${profileAId}/appointments/${createdAppointmentId}/reschedule`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ localDate: '2026-11-21', localTime: '11:00', reason: 'Patient requested afternoon' });
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.localDate).toBe('2026-11-21');
      expect(resOwner.body.localTime).toBe('11:00');
      expect(resOwner.body.rescheduledFrom).toBeDefined();
    });

    it('POST /appointments/:id/cancel - Owner can cancel appointment; Family rejected', async () => {
      const resFamily = await request(app)
        .post(`/api/profiles/${profileAId}/appointments/${createdAppointmentId}/cancel`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(403);

      const resOwner = await request(app)
        .post(`/api/profiles/${profileAId}/appointments/${createdAppointmentId}/cancel`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Condition resolved' });
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.status).toBe('CANCELLED');
    });
  });

  describe('5. Caregiver Notes Permissions Matrix (Stage 5)', () => {
    it('POST /notes - Caregiver and Owner can add notes; Family rejected (addNotes: false)', async () => {
      const notePayload = {
        note: 'Patient was alert and took medication with breakfast. Vitals normal.',
        isFlagged: false
      };

      // 1. Family rejected (403)
      const resFamily = await request(app)
        .post(`/api/profiles/${profileAId}/notes`)
        .set('Authorization', `Bearer ${familyToken}`)
        .send(notePayload);
      expect(resFamily.status).toBe(403);
      expect(resFamily.body.error.code).toBe('FORBIDDEN');

      // 2. Caregiver adds note (201)
      const resCaregiver = await request(app)
        .post(`/api/profiles/${profileAId}/notes`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send(notePayload);
      expect(resCaregiver.status).toBe(201);
      expect(resCaregiver.body.id).toBeDefined();
      expect(resCaregiver.body.note).toContain('breakfast');
      caregiverNoteId = resCaregiver.body.id;

      // 3. Owner adds note (201)
      const resOwner = await request(app)
        .post(`/api/profiles/${profileAId}/notes`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ note: 'Owner observation: slept well.', isFlagged: false });
      expect(resOwner.status).toBe(201);

      // 4. Cross-profile rejected with 404
      const resOther = await request(app)
        .post(`/api/profiles/${profileAId}/notes`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send(notePayload);
      expect(resOther.status).toBe(404);
    });

    it('GET /notes - Owner, Family, Caregiver get 200 (viewActivity: true)', async () => {
      const resFamily = await request(app)
        .get(`/api/profiles/${profileAId}/notes`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(200);
      expect(Array.isArray(resFamily.body)).toBe(true);
      expect(resFamily.body.length).toBeGreaterThanOrEqual(1);

      const resCaregiver = await request(app)
        .get(`/api/profiles/${profileAId}/notes`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(resCaregiver.status).toBe(200);
    });

    it('DELETE /notes/:id - Author can delete note; Non-author non-owner rejected', async () => {
      // Family attempts to delete caregiver note -> 403
      const resFamily = await request(app)
        .delete(`/api/profiles/${profileAId}/notes/${caregiverNoteId}`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(403);

      // Caregiver deletes own note -> 200
      const resCaregiver = await request(app)
        .delete(`/api/profiles/${profileAId}/notes/${caregiverNoteId}`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(resCaregiver.status).toBe(200);
      expect(resCaregiver.body.success).toBe(true);
    });
  });

  describe('6. Shared Activity Timeline (Stage 5)', () => {
    it('GET /activity - Aggregated timeline returned to authorized members; excludes sensitive audit details', async () => {
      const resFamily = await request(app)
        .get(`/api/profiles/${profileAId}/activity`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(200);
      expect(Array.isArray(resFamily.body.activity)).toBe(true);

      // Verify no sensitive IP or user-agent leakage in items
      const items = resFamily.body.activity;
      for (const item of items) {
        expect(item.ipAddress).toBeUndefined();
        expect(item.userAgent).toBeUndefined();
      }

      // Cross-profile rejected with 404
      const resOther = await request(app)
        .get(`/api/profiles/${profileAId}/activity`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(resOther.status).toBe(404);
    });
  });

  describe('7. Notifications Isolation (Stage 4 & 5)', () => {
    it('GET /api/notifications - User reads own notifications; cannot read or mark other user notifications', async () => {
      const resOwner = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.notifications.some((n: any) => n.id === ownerNotificationId)).toBe(true);

      // Family user cannot mark Owner's notification as read (returns 404)
      const resFamily = await request(app)
        .patch(`/api/notifications/${ownerNotificationId}/read`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(404);

      // Owner marks own notification as read
      const resMark = await request(app)
        .patch(`/api/notifications/${ownerNotificationId}/read`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resMark.status).toBe(200);
      expect(resMark.body.readAt).toBeDefined();
    });
  });

  describe('8. Real-Time Revocation Test', () => {
    it('revoking a member by owner causes their very next request to return 404 immediately', async () => {
      // 1. Target user can view profile before revocation
      const preCheck = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${targetRevokeToken}`);
      expect(preCheck.status).toBe(200);

      // 2. Owner revokes target member
      const revokeRes = await request(app)
        .delete(`/api/profiles/${profileAId}/care-network/${targetRevMemId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // 3. Immediate next request returns 404!
      const postCheck = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${targetRevokeToken}`);
      expect(postCheck.status).toBe(404);
      expect(postCheck.body.error.code).toBe('PROFILE_NOT_FOUND');
    });
  });
});
