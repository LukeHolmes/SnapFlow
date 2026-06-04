import { Router } from 'express';
import { accounts, type Tier } from '../accounts/store';
import { AppError, asyncHandler } from '../errors';

// Billing webhook (architecture §5.5). Production verifies the Paddle/Stripe
// signature before trusting the payload; here it applies the tier change directly.
export const billingRouter = Router();

billingRouter.post('/v1/billing/webhook', asyncHandler(async (req, res) => {
  const { accountId, tier } = req.body ?? {};
  const valid: Tier[] = ['free', 'pro', 'team', 'perpetual'];
  if (!accountId || !valid.includes(tier)) throw new AppError(400, 'bad_request', 'accountId and a valid tier are required');
  if (!(await accounts.get(accountId))) throw new AppError(404, 'not_found', 'Account not found');
  await accounts.setTier(accountId, tier);
  res.json({ ok: true });
}));
