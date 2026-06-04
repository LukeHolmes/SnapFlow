import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { vault } from './store';
import { AppError, asyncHandler } from '../errors';

export const vaultRouter = Router();

vaultRouter.put('/v1/vault/:destination', requireAuth, asyncHandler(async (req, res) => {
  const secret = req.body?.secret as string | undefined;
  if (!secret) throw new AppError(400, 'bad_request', 'secret is required');
  await vault.put(req.account!.id, req.params.destination, secret);
  res.json({ ok: true, destination: req.params.destination });
}));

vaultRouter.get('/v1/vault/:destination', requireAuth, asyncHandler(async (req, res) => {
  const meta = await vault.getMeta(req.account!.id, req.params.destination);
  res.json({ exists: !!meta, ...meta });
}));

vaultRouter.delete('/v1/vault/:destination', requireAuth, asyncHandler(async (req, res) => {
  await vault.remove(req.account!.id, req.params.destination);
  res.json({ ok: true });
}));
