import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../db/prisma';
import { hashPassword, generateSessionId, hashInvitationCode } from '../utils/crypto';

describe('Gate 5: Backend Permissions Matrix & Authorization', () => {
  let ownerToken: string;
  let familyToken: string;
  let caregiverToken: string;
  let otherUserToken: string;
  let revokedMemberToken: string;

  let ownerUserId: string;
  let familyUserId: string;
  let caregiverUserId: string;
  let otherUserId: string;
  let revokedUserId: string;

  let profileAId: string;
  let careNetworkAId: string;
  let profileBId: string;

  let caregiverMemberId: string;
  let familyMemberId: string;
  let revokedMemberId: string;

  beforeAll(async () => {
    // Clean test database tables
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

    const revokedUser = await prisma.user.create({
      data: { email: 'revoked@carebuddy.local', passwordHash: commonHash, name: 'Eve Revoked' }
    });
    revokedUserId = revokedUser.id;

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
    revokedMemberToken = await makeSession(revokedUserId);

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

    // Attach Family to Network A
    const famMem = await prisma.careNetworkMember.create({
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
    familyMemberId = famMem.id;

    // Attach Caregiver to Network A
    const cgMem = await prisma.careNetworkMember.create({
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
    caregiverMemberId = cgMem.id;

    // Attach Revoked User to Network A (status = REVOKED)
    const revMem = await prisma.careNetworkMember.create({
      data: {
        careNetworkId: careNetworkAId,
        userId: revokedUserId,
        role: 'FAMILY',
        status: 'REVOKED',
        relationshipLabel: 'Estranged Relative'
      }
    });
    revokedMemberId = revMem.id;

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
      // otherUser attempts to read profileA
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

  describe('3. Revoked Member Access (Immediate Effect)', () => {
    it('returns 404 immediately for revoked member attempting to read profile', async () => {
      const res = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${revokedMemberToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('returns 404 immediately for revoked member accessing care network', async () => {
      const res = await request(app)
        .get(`/api/profiles/${profileAId}/care-network`)
        .set('Authorization', `Bearer ${revokedMemberToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('4. Owner vs. Family vs. Caregiver Permissions Matrix', () => {
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
      // Family attempt -> 403
      const resFamily = await request(app)
        .patch(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${familyToken}`)
        .send({ timezone: 'Europe/London' });
      expect(resFamily.status).toBe(403);
      expect(resFamily.body.error.code).toBe('OWNER_PERMISSION_REQUIRED');

      // Caregiver attempt -> 403
      const resCaregiver = await request(app)
        .patch(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ reminderLeadMinutes: 30 });
      expect(resCaregiver.status).toBe(403);
      expect(resCaregiver.body.error.code).toBe('OWNER_PERMISSION_REQUIRED');

      // Owner attempt -> 200
      const resOwner = await request(app)
        .patch(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reminderLeadMinutes: 20 });
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.profile.reminderLeadMinutes).toBe(20);
    });

    it('POST /api/profiles/:profileId/invitations - Only Owner can invite', async () => {
      // Family attempt -> 403
      const resFamily = await request(app)
        .post(`/api/profiles/${profileAId}/invitations`)
        .set('Authorization', `Bearer ${familyToken}`)
        .send({ role: 'FAMILY', relationshipLabel: 'Sister' });
      expect(resFamily.status).toBe(403);

      // Caregiver attempt -> 403
      const resCaregiver = await request(app)
        .post(`/api/profiles/${profileAId}/invitations`)
        .set('Authorization', `Bearer ${caregiverToken}`)
        .send({ role: 'CAREGIVER' });
      expect(resCaregiver.status).toBe(403);

      // Owner attempt -> 201
      const resOwner = await request(app)
        .post(`/api/profiles/${profileAId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'CAREGIVER', relationshipLabel: 'Night Nurse' });
      expect(resOwner.status).toBe(201);
      expect(resOwner.body.code).toBeDefined();
      expect(resOwner.body.code.length).toBe(10);
    });

    it('GET /api/profiles/:profileId/audit - Only Owner sees full audit log', async () => {
      // Family attempt -> 403
      const resFamily = await request(app)
        .get(`/api/profiles/${profileAId}/audit`)
        .set('Authorization', `Bearer ${familyToken}`);
      expect(resFamily.status).toBe(403);

      // Caregiver attempt -> 403
      const resCaregiver = await request(app)
        .get(`/api/profiles/${profileAId}/audit`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(resCaregiver.status).toBe(403);

      // Owner attempt -> 200
      const resOwner = await request(app)
        .get(`/api/profiles/${profileAId}/audit`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(200);
      expect(Array.isArray(resOwner.body.auditLogs)).toBe(true);
    });
  });

  describe('5. Real-Time Revocation Test', () => {
    it('revoking a member by owner causes their very next request to return 404', async () => {
      // Step 1: Caregiver can currently view the profile
      const preCheck = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(preCheck.status).toBe(200);

      // Step 2: Owner revokes Caregiver
      const revokeRes = await request(app)
        .delete(`/api/profiles/${profileAId}/care-network/${caregiverMemberId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Step 3: Immediate next request by Caregiver returns 404!
      const postCheck = await request(app)
        .get(`/api/profiles/${profileAId}`)
        .set('Authorization', `Bearer ${caregiverToken}`);
      expect(postCheck.status).toBe(404);
      expect(postCheck.body.error.code).toBe('PROFILE_NOT_FOUND');
    });
  });
});
