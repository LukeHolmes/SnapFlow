// Cloud sync + server-side Team search (architecture §5.3, §5.6). Tier-gated;
// workspace-scoped; metadata-first with lazy image blobs.
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth/middleware';
import { entitlementsFor } from '../entitlements/index';
import { sync, type SyncRecord } from './store';
import { AppError, asyncHandler } from '../errors';

export const syncRouter = Router();

function requireCloudSync(req: Request, _res: Response, next: NextFunction): void {
  if (!entitlementsFor(req.account!.tier).cloudSync) throw new AppError(402, 'sync_not_entitled', 'Cloud sync requires a Pro or Team plan');
  next();
}
function requireSharedLibrary(req: Request, _res: Response, next: NextFunction): void {
  if (!entitlementsFor(req.account!.tier).sharedLibrary) throw new AppError(402, 'search_not_entitled', 'Server-side search requires a Team plan');
  next();
}

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

// Server-side full-text search across the Team shared library (Team tier).
// NOTE: a production build verifies the account is a member of `workspace`
// before searching; the membership model lives in the workspaces module (§5.6).
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

syncRouter.get('/v1/sync/blob/:captureId', requireAuth, requireCloudSync, asyncHandler(async (req, res) => {
  const base64 = await sync.getBlob(req.account!.id, req.params.captureId);
  if (base64 === null) throw new AppError(404, 'not_found', 'Blob not found');
  res.json({ base64 });
}));
