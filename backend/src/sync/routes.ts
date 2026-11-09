// Cloud sync + server-side Team search (architecture §5.3, §5.6). Tier-gated;
// workspace-scoped; metadata-first with lazy image blobs.
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware';
import { entitlementsFor } from '../entitlements/index';
import { effectiveTierForAccount } from '../entitlements/resolve';
import { sync, type SyncRecord } from './store';
import { AppError, asyncHandler } from '../errors';
import { config } from '../config';
import { buildCaptureUrl, verifyCaptureSignature, defaultCaptureExpiry } from '../storage/signed-url';

export const syncRouter = Router();

const requireCloudSync = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const tier = await effectiveTierForAccount(req.account!.id);
  if (!entitlementsFor(tier).cloudSync) throw new AppError(402, 'sync_not_entitled', 'Cloud sync requires a Pro or Team plan');
  next();
});
const requireSharedLibrary = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const tier = await effectiveTierForAccount(req.account!.id);
  if (!entitlementsFor(tier).sharedLibrary) throw new AppError(402, 'search_not_entitled', 'Server-side search requires a Team plan');
  next();
});

syncRouter.post('/v1/sync/push', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const records = (req.body?.records ?? []) as SyncRecord[];
  if (!Array.isArray(records)) throw new AppError(400, 'bad_request', 'records must be an array');
  res.json(await sync.push(req.account!.id, records));
}));

syncRouter.get('/v1/sync/pull', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const workspace = String(req.query.workspace ?? '');
  const since = Number(req.query.since ?? 0);
  if (!workspace) throw new AppError(400, 'bad_request', 'workspace is required');
  res.json(await sync.pull(req.account!.id, workspace, Number.isFinite(since) ? since : 0));
}));

syncRouter.get('/v1/search', requireAuth, requireSharedLibrary, asyncHandler(async (req, res) => {
  const workspace = String(req.query.workspace ?? '');
  const q = String(req.query.q ?? '');
  if (!workspace) throw new AppError(400, 'bad_request', 'workspace is required');
  res.json({ results: await sync.searchWorkspace(workspace, q) });
}));

syncRouter.put('/v1/sync/blob/:captureId', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const base64 = req.body?.base64 as string | undefined;
  if (!base64) throw new AppError(400, 'bad_request', 'base64 is required');
  await sync.putBlob(req.account!.id, req.params.captureId, base64);
  res.json({ ok: true });
}));

syncRouter.post('/v1/sync/blob/:captureId/upload', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const base64 = req.body?.base64 as string | undefined;
  if (!base64) throw new AppError(400, 'bad_request', 'base64 is required');
  await sync.putBlob(req.account!.id, req.params.captureId, base64);
  res.json({ ok: true, url: buildCaptureUrl(req.account!.id, req.params.captureId) });
}));

syncRouter.get('/v1/sync/blob/:captureId', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const base64 = await sync.getBlob(req.account!.id, req.params.captureId);
  if (base64 === null) throw new AppError(404, 'not_found', 'Blob not found');
  res.json({ base64 });
}));

syncRouter.get('/v1/sync/blob/:captureId/signed-url', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const captureId = req.params.captureId;
  if (!(await sync.blobAvailable(req.account!.id, captureId))) {
    throw new AppError(404, 'not_found', 'Blob not found');
  }
  const ttlMs = Number(req.query.ttlMs ?? 0);
  const expiresAt = Number.isFinite(ttlMs) && ttlMs > 0 ? Date.now() + ttlMs : undefined;
  const exp = expiresAt ?? defaultCaptureExpiry();
  res.json({ url: buildCaptureUrl(req.account!.id, captureId, exp), expiresAt: exp, ttlMs: config.signedUrlTtlMs });
}));

syncRouter.post('/v1/sync/signed-url/verify', asyncHandler(async (req, res) => {
  const accountId = String(req.body?.accountId ?? '');
  const captureId = String(req.body?.captureId ?? '');
  const exp = Number(req.body?.exp);
  const sig = String(req.body?.sig ?? '');
  if (!accountId || !captureId || !sig) throw new AppError(400, 'bad_request', 'accountId, captureId, exp and sig are required');
  const verdict = verifyCaptureSignature(accountId, captureId, exp, sig);
  if (!verdict.ok) {
    res.json({ valid: false, reason: verdict.reason });
    return;
  }
  const available = await sync.blobAvailable(accountId, captureId);
  res.json({ valid: available, reason: available ? undefined : 'revoked_or_missing' });
}));

syncRouter.delete('/v1/sync/blob/:captureId', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const revoked = await sync.revokeBlob(req.account!.id, req.params.captureId);
  if (!revoked) throw new AppError(404, 'not_found', 'Blob not found');
  res.json({ ok: true });
}));
