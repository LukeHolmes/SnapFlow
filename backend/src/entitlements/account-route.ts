import { accounts } from '../accounts/store';
import { requireAuth } from '../auth/middleware';
import { AppError, asyncHandler } from '../errors';
import { entitlementsRouter } from './routes';

entitlementsRouter.get('/v1/account', requireAuth, asyncHandler(async (req, res) => {
  const acct = await accounts.get(req.account!.id);
  if (!acct) throw new AppError(404, 'not_found', 'Account not found');
  res.json({ accountId: acct.id, email: acct.email, tier: acct.tier });
}));
