import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../db/prisma';

describe('Auth & Recovery Codes Specification Tests', () => {
  beforeAll(async () => {
    await prisma.session.deleteMany().catch(() => {});
    await prisma.recoveryCode.deleteMany().catch(() => {});
    await prisma.userSettings.deleteMany().catch(() => {});
    await prisma.user.deleteMany().catch(() => {});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let savedRecoveryCode: string;
  const userEmail = 'testauth@carebuddy.local';
  const initialPassword = 'InitialSecurePassword123!';
  const updatedPassword = 'NewSecurePassword456!';

  it('registers a user, generates 8 recovery codes (shown once), and creates a session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: userEmail,
        password: initialPassword,
        name: 'Test Elder'
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(userEmail);
    expect(Array.isArray(res.body.recoveryCodes)).toBe(true);
    expect(res.body.recoveryCodes.length).toBe(8);

    // Save one recovery code for forgot-password test
    savedRecoveryCode = res.body.recoveryCodes[0];

    // Check cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('carebuddy_session=');
  });

  it('logs in successfully and returns user info with cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: userEmail,
        password: initialPassword
      });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(userEmail);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: userEmail,
        password: 'WrongPassword999!'
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('recovers password with one-time recovery code and revokes previous sessions', async () => {
    // 1. Establish an active session
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: userEmail,
        password: initialPassword
      });
    expect(loginRes.status).toBe(200);
    const oldSessionCookie = loginRes.headers['set-cookie'][0];

    // 2. Perform forgot-password with the saved one-time recovery code
    const resetRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({
        email: userEmail,
        recoveryCode: savedRecoveryCode,
        newPassword: updatedPassword
      });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);
    const newSessionCookie = resetRes.headers['set-cookie'][0];

    // 3. The old session must now be revoked (Section 4 mandate)
    const oldSessionCheck = await request(app)
      .get('/api/auth/me')
      .set('Cookie', oldSessionCookie);
    expect(oldSessionCheck.status).toBe(401);

    // 4. The new session works
    const newSessionCheck = await request(app)
      .get('/api/auth/me')
      .set('Cookie', newSessionCookie);
    expect(newSessionCheck.status).toBe(200);
    expect(newSessionCheck.body.user.email).toBe(userEmail);

    // 5. The recovery code cannot be reused (single-use)
    const reuseRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({
        email: userEmail,
        recoveryCode: savedRecoveryCode,
        newPassword: 'AnotherPassword789!'
      });
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.error.code).toBe('INVALID_RECOVERY_CODE');
  });
});
