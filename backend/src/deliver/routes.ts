// POST /v1/deliver — server-side delivery using the vault (architecture §5.2).
// The client sends the image + target; the backend looks up the encrypted token,
// reveals it server-side, and performs the delivery. Tokens never reach the client.
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { getServerDestination } from './destinations';
import { AppError, asyncHandler } from '../errors';

export const deliverRouter = Router();

deliverRouter.post('/v1/deliver', requireAuth, asyncHandler(async (req, res) => {
  const { destination, imageBase64, filename, captureId, workspaceId, config, metadata } = req.body ?? {};
  if (!destination || !imageBase64 || !captureId || !workspaceId) {
    throw new AppError(400, 'bad_request', 'destination, captureId, workspaceId and imageBase64 are required');
  }

  const dest = getServerDestination(destination);
  if (!dest) throw new AppError(400, 'unknown_destination', `No server destination '${destination}'`);

  const result = await dest.deliver(req.account!.id, {
    captureId,
    workspaceId,
    imageBase64,
    filename: filename ?? 'Capture',
    config: typeof config === 'object' && config ? config : {},
    metadata: {
      tag: typeof metadata?.tag === 'string' ? metadata.tag : null,
      ocrText: typeof metadata?.ocrText === 'string' ? metadata.ocrText : '',
      hasPii: !!metadata?.hasPii,
      createdAt: Number(metadata?.createdAt ?? Date.now()),
    },
  });
  res.json(result);
}));
