import { Router } from 'express';
import { accounts, type Tier } from '../accounts/store';
import { issueToken } from './tokens';
import { AppError, asyncHandler } from '../errors';
import { config } from '../config';

export const authRouter = Router();

// Dev login: exchange an email for a bearer token. Disabled when DEV_LOGIN=false.
// Production uses the OAuth flow (auth/oauth.ts).
authRouter.post('/auth/token', asyncHandler(async (req, res) => {
  if (!config.devLogin) throw new AppError(403, 'dev_login_disabled', 'Dev login is disabled; use OAuth');
  const email = (req.body?.email ?? '').trim();
  if (!email) throw new AppError(400, 'bad_request', 'email is required');
  const tier = (req.body?.tier as Tier) ?? 'pro';
  const account = await accounts.getOrCreate(email, tier);
  res.json({ token: issueToken(account.id), account: { id: account.id, email: account.email, tier: account.tier } });
}));
