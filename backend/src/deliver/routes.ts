// POST /v1/deliver — server-side delivery using the vault (architecture §5.2).
// The client sends the image + target; the backend looks up the encrypted token,
// reveals it server-side, and performs the delivery. Tokens never reach the client.
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { vault } from '../vault/store';
import { getServerDestination } from './destinations';
import { AppError, asyncHandler } from '../errors';

export const deliverRouter = Router();

deliverRouter.post('/v1/deliver', requireAuth, asyncHandler(async (req, res) => {
  const { destination, imageBase64, filename, target } = req.body ?? {};
  if (!destination || !imageBase64 || !target) throw new AppError(400, 'bad_request', 'destination, imageBase64 and target are required');

  const dest = getServerDestination(destination);
  if (!dest) throw new AppError(400, 'unknown_destination', `No server destination '${destination}'`);

  const token = await vault.reveal(req.account!.id, destination);
  if (!token) throw new AppError(409, 'not_connected', `${destination} is not connected — store a token via /v1/vault/${destination}`);

  const result = await dest.deliver(token, { imageBase64, filename: filename ?? 'Capture', target });
  res.json(result);
}));
