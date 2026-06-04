// HMAC-signed bearer tokens (a minimal JWT-shaped scheme, no dependency).
// Format: accountId.expiry.signature(base64url). Real builds would issue these
// after an OAuth login; here POST /auth/token mints one for a dev account.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

const b64u = (b: Buffer) => b.toString('base64url');

export function issueToken(accountId: string, ttlSec = 60 * 60 * 24 * 7): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${accountId}.${exp}`;
  const sig = createHmac('sha256', config.authSecret).update(payload).digest();
  return `${payload}.${b64u(sig)}`;
}

export function verifyToken(token: string): { accountId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [accountId, expStr, sigStr] = parts;
  const expected = createHmac('sha256', config.authSecret).update(`${accountId}.${expStr}`).digest();
  let given: Buffer;
  try { given = Buffer.from(sigStr, 'base64url'); } catch { return null; }
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return { accountId };
}
