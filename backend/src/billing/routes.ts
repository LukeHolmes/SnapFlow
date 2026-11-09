import { Router } from 'express';
import { accounts, type Tier } from '../accounts/store';
import { requireAuth } from '../auth/middleware';
import { AppError, asyncHandler } from '../errors';

// Billing webhook (architecture §5.5). Production verifies the Paddle/Stripe
// signature before trusting the payload; here it applies the tier change directly.
//
// BILLING HOOK STUB — Team seats / Stripe Checkout are NOT wired in v1.1.0.
// When integrated: map `checkout.session.completed` → accounts.setTier + teams.setSeatLimit.
export const billingRouter = Router();

/** Stub for future Team checkout — returns a placeholder URL only (no real charges). */
billingRouter.post('/v1/billing/team/checkout-stub', requireAuth, asyncHandler(async (_req, res) => {
  res.json({
    stub: true,
    message: 'Billing not configured — use DEV_LOGIN or POST /v1/billing/webhook in development.',
    checkoutUrl: null,
  });
}));

billingRouter.post('/v1/billing/webhook', asyncHandler(async (req, res) => {
  const { accountId, tier } = req.body ?? {};
  const valid: Tier[] = ['free', 'pro', 'team', 'perpetual'];
  if (!accountId || !valid.includes(tier)) throw new AppError(400, 'bad_request', 'accountId and a valid tier are required');
  if (!(await accounts.get(accountId))) throw new AppError(404, 'not_found', 'Account not found');
  await accounts.setTier(accountId, tier);
  res.json({ ok: true });
}));
