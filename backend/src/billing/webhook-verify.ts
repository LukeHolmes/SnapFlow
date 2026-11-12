import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SIGNATURE_AGE_SEC = 5 * 60;

export interface BillingWebhookPayload {
  accountId: string;
  tier: string;
}

/** Stripe-style `t=<unix>,v1=<hex>` signature over `${t}.${rawBody}`. */
export function verifyBillingWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: string } {
  if (!signatureHeader?.trim()) return { ok: false, reason: 'missing_signature' };
  if (!secret) return { ok: false, reason: 'webhook_secret_not_configured' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => {
      const i = p.indexOf('=');
      return i === -1 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: 'malformed_signature' };
  if (Math.abs(nowSec - t) > MAX_SIGNATURE_AGE_SEC) return { ok: false, reason: 'timestamp_out_of_tolerance' };

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'signature_mismatch' };
  return { ok: true };
}

export function signBillingWebhookPayload(rawBody: string, secret: string, nowSec?: number): string {
  const t = nowSec ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${v1}`;
}
