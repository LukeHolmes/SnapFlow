import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { defaultCaptureExpiry, shareLinkSigningSecret } from './signed-url';

export function signTeamLibraryCapture(teamId: string, ownerAccountId: string, captureId: string, expiresAt = defaultCaptureExpiry()) {
  const sig = hmac(teamId, ownerAccountId, captureId, expiresAt);
  return { exp: expiresAt, sig };
}

export function buildTeamLibraryCapturePath(teamId: string, ownerAccountId: string, captureId: string): string {
  return `/v1/teams/${encodeURIComponent(teamId)}/captures/${encodeURIComponent(ownerAccountId)}/${encodeURIComponent(captureId)}.png`;
}

export function buildTeamLibraryCaptureUrl(teamId: string, ownerAccountId: string, captureId: string, expiresAt = defaultCaptureExpiry()): string {
  const { exp, sig } = signTeamLibraryCapture(teamId, ownerAccountId, captureId, expiresAt);
  const path = buildTeamLibraryCapturePath(teamId, ownerAccountId, captureId);
  return `${config.publicBaseUrl}${path}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export type TeamVerifyResult = { ok: true } | { ok: false; reason: 'invalid_exp' | 'expired' | 'tampered' };

export function verifyTeamLibrarySignature(
  teamId: string,
  ownerAccountId: string,
  captureId: string,
  exp: number,
  sig: string,
): TeamVerifyResult {
  if (!Number.isFinite(exp) || exp <= 0) return { ok: false, reason: 'invalid_exp' };
  if (Date.now() > exp) return { ok: false, reason: 'expired' };
  const expected = hmac(teamId, ownerAccountId, captureId, exp);
  if (!safeEqual(expected, sig)) return { ok: false, reason: 'tampered' };
  return { ok: true };
}

function hmac(teamId: string, ownerAccountId: string, captureId: string, exp: number): string {
  return createHmac('sha256', shareLinkSigningSecret()).update(`team:${teamId}:${ownerAccountId}:${captureId}:${exp}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
