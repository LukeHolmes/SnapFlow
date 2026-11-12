// HMAC-signed bearer access tokens bound to a server-side session (revocable).
// Format: accountId.exp.sessionId.signature(base64url)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

const b64u = (b: Buffer) => b.toString('base64url');

export type AccessTokenClaims = { accountId: string; sessionId: string };

export function issueAccessToken(accountId: string, sessionId: string, ttlSec = config.accessTokenTtlSec): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${accountId}.${exp}.${sessionId}`;
  const sig = createHmac('sha256', config.authSecret).update(payload).digest();
  return `${payload}.${b64u(sig)}`;
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [accountId, expStr, sessionId, sigStr] = parts;
  const payload = `${accountId}.${expStr}.${sessionId}`;
  const expected = createHmac('sha256', config.authSecret).update(payload).digest();
  let given: Buffer;
  try { given = Buffer.from(sigStr, 'base64url'); } catch { return null; }
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  if (!accountId || !sessionId) return null;
  return { accountId, sessionId };
}

/** @deprecated Use verifyAccessToken */
export const verifyToken = verifyAccessToken;
