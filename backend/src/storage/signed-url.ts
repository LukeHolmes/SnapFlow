import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

export interface SignedUrlParts {
  exp: number;
  sig: string;
}

export function defaultCaptureExpiry(): number {
  return Date.now() + config.signedUrlTtlMs;
}

export function signCaptureUrl(accountId: string, captureId: string, expiresAt = defaultCaptureExpiry()): SignedUrlParts {
  return { exp: expiresAt, sig: hmac(accountId, captureId, expiresAt) };
}

export function buildPublicCapturePath(accountId: string, captureId: string): string {
  return `/v1/public/captures/${encodeURIComponent(accountId)}/${encodeURIComponent(captureId)}.png`;
}

export function buildCaptureUrl(accountId: string, captureId: string, expiresAt = defaultCaptureExpiry()): string {
  const { exp, sig } = signCaptureUrl(accountId, captureId, expiresAt);
  const path = buildPublicCapturePath(accountId, captureId);
  return `${config.publicBaseUrl}${path}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'invalid_exp' | 'expired' | 'tampered' };

export function verifyCaptureSignature(accountId: string, captureId: string, exp: number, sig: string): VerifyResult {
  if (!Number.isFinite(exp) || exp <= 0) return { ok: false, reason: 'invalid_exp' };
  if (Date.now() > exp) return { ok: false, reason: 'expired' };
  const expected = hmac(accountId, captureId, exp);
  if (!safeEqual(expected, sig)) return { ok: false, reason: 'tampered' };
  return { ok: true };
}

export function shareLinkSigningSecret(): string {
  if (config.shareLinkSecret) return config.shareLinkSecret;
  if (config.isProduction) throw new Error('SHARE_LINK_SECRET is required');
  return config.authSecret;
}

function hmac(accountId: string, captureId: string, exp: number): string {
  return createHmac('sha256', shareLinkSigningSecret()).update(`${accountId}:${captureId}:${exp}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
