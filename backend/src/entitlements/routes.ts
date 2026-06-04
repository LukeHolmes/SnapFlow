import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { entitlementsFor } from './index';

export const entitlementsRouter = Router();

entitlementsRouter.get('/v1/entitlements', requireAuth, (req, res) => {
  res.json(entitlementsFor(req.account!.tier));
});
