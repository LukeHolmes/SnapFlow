import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { vault } from './store';
import { AppError, asyncHandler } from '../errors';
import { routeParam } from '../params';

export const vaultRouter = Router();

vaultRouter.put('/v1/vault/:destination', requireAuth, asyncHandler(async (req, res) => {
  const secret = req.body?.secret as string | undefined;
  if (!secret) throw new AppError(400, 'bad_request', 'secret is required');
  const destination = routeParam(req.params.destination);
  await vault.put(req.account!.id, destination, secret);
  res.json({ ok: true, destination });
}));

vaultRouter.get('/v1/vault/:destination', requireAuth, asyncHandler(async (req, res) => {
  const meta = await vault.getMeta(req.account!.id, routeParam(req.params.destination));
  res.json({ exists: !!meta, ...meta });
}));

vaultRouter.delete('/v1/vault/:destination', requireAuth, asyncHandler(async (req, res) => {
  await vault.remove(req.account!.id, routeParam(req.params.destination));
  res.json({ ok: true });
}));
