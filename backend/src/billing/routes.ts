import { Router } from 'express';
import { accounts, type Tier } from '../accounts/store';
import { requireAuth } from '../auth/middleware';
import { config } from '../config';
import { AppError, asyncHandler } from '../errors';
import { signBillingWebhookPayload, verifyBillingWebhookSignature } from './webhook-verify';

// Billing webhook (architecture §5.5). Production verifies an HMAC signature
// (Stripe-style) before trusting the payload.
//
// BILLING HOOK STUB — Team seats / Stripe Checkout are NOT wired in v1.1.0.
export const billingRouter = Router();

/** Stub for future Team checkout — disabled in production (no real charges). */
billingRouter.post('/v1/billing/team/checkout-stub', requireAuth, asyncHandler(async (_req, res) => {
  if (config.isProduction) {
    throw new AppError(503, 'billing_disabled', 'In-app checkout is not available in production builds yet.');
  }
  res.json({
    stub: true,
    disabled: false,
    message: 'Billing not configured — use DEV_LOGIN=true or a signed POST /v1/billing/webhook in development.',
    checkoutUrl: null,
  });
}));

billingRouter.post('/v1/billing/webhook', asyncHandler(async (req, res) => {
  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
  const signature = req.header('snapflow-signature') ?? req.header('x-snapflow-signature');

  const secret = config.billingWebhookSecret;
  const allowUnsignedDev = !config.isProduction && config.devLogin && !secret;

  if (!allowUnsignedDev) {
    const verdict = verifyBillingWebhookSignature(rawBody, signature, secret);
    if (!verdict.ok) throw new AppError(401, 'invalid_webhook_signature', `Webhook signature rejected (${verdict.reason})`);
  }

  const { accountId, tier } = (req.body ?? {}) as { accountId?: string; tier?: Tier };
  const valid: Tier[] = ['free', 'pro', 'team', 'perpetual'];
  if (!accountId || !tier || !valid.includes(tier)) {
    throw new AppError(400, 'bad_request', 'accountId and a valid tier are required');
  }
  if (!(await accounts.get(accountId))) throw new AppError(404, 'not_found', 'Account not found');
  await accounts.setTier(accountId, tier);
  res.json({ ok: true });
}));

export { signBillingWebhookPayload };
