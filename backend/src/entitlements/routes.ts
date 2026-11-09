import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { entitlementsFor } from './index';
import { effectiveTierForAccount } from './resolve';
import { asyncHandler } from '../errors';

export const entitlementsRouter = Router();

entitlementsRouter.get('/v1/entitlements', requireAuth, asyncHandler(async (req, res) => {
  const tier = await effectiveTierForAccount(req.account!.id);
  res.json({ ...entitlementsFor(tier), accountTier: req.account!.tier });
}));
