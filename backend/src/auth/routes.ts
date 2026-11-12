import { Router } from 'express';
import { accounts, type Tier } from '../accounts/store';
import { AppError, asyncHandler } from '../errors';
import { config } from '../config';
import { mintAuthCredentials, refreshAuthCredentials, revokeSession } from './sessions';
import { requireAuth } from './middleware';
import { verifyAccessToken } from './tokens';

export const authRouter = Router();

// Dev login: exchange an email for bearer credentials. Disabled when DEV_LOGIN=false.
// Production uses the OAuth flow (auth/oauth.ts).
authRouter.post('/auth/token', asyncHandler(async (req, res) => {
  if (!config.devLogin) throw new AppError(403, 'dev_login_disabled', 'Dev login is disabled; use OAuth');
  const email = (req.body?.email ?? '').trim();
  if (!email) throw new AppError(400, 'bad_request', 'email is required');
  const tier = (req.body?.tier as Tier) ?? 'pro';
  const account = await accounts.getOrCreate(email, tier);
  const credentials = await mintAuthCredentials(account.id);
  res.json({
    token: credentials.accessToken,
    ...credentials,
    account: { id: account.id, email: account.email, tier: account.tier },
  });
}));

authRouter.post('/v1/auth/refresh', asyncHandler(async (req, res) => {
  const refreshToken = String(req.body?.refreshToken ?? '');
  if (!refreshToken) throw new AppError(400, 'bad_request', 'refreshToken is required');
  const credentials = await refreshAuthCredentials(refreshToken);
  res.json(credentials);
}));

authRouter.post('/v1/auth/revoke', requireAuth, asyncHandler(async (req, res) => {
  const header = req.header('authorization') ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claim = raw ? verifyAccessToken(raw) : null;
  if (!claim) throw new AppError(401, 'unauthorized', 'Missing or invalid bearer token');
  if (claim.accountId !== req.account!.id) {
    throw new AppError(403, 'forbidden', 'Token does not match the signed-in account');
  }
  const revoked = await revokeSession(claim.sessionId, claim.accountId);
  res.json({ ok: true, revoked });
}));
