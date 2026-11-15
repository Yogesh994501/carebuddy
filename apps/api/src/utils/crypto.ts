import argon2 from 'argon2';
import crypto from 'crypto';
import { env } from '../config/env';

// Unambiguous alphabet (no 0/O, 1/I/L)
const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateRandomCode(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += UNAMBIGUOUS_ALPHABET[bytes[i] % UNAMBIGUOUS_ALPHABET.length];
  }
  return code;
}

export async function generateRecoveryCodes(count = 8): Promise<{ plainCodes: string[]; hashedCodes: string[] }> {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Format: XXXX-XXXX (8 chars unambiguous)
    const part1 = generateRandomCode(4);
    const part2 = generateRandomCode(4);
    const code = `${part1}-${part2}`;
    plainCodes.push(code);

    const hash = await hashPassword(code);
    hashedCodes.push(hash);
  }

  return { plainCodes, hashedCodes };
}

export function hashInvitationCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return crypto
    .createHmac('sha256', env.INVITATION_PEPPER)
    .update(normalized)
    .digest('hex');
}
