import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, AppError } from '../errors';
import { requireEvidenceIdentity, requireEvidenceSync } from './middleware';
import {
  createEvidenceItem,
  createPack,
  exportPack,
  getItemWithVersions,
  ingestRedactedVersion,
  signPack,
} from './service';

export const evidenceRouter = Router();

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function errFromThrown(e: unknown): never {
  if (e && typeof e === 'object' && 'status' in e && 'message' in e) {
    const o = e as { status: number; code?: string; message: string };
    throw new AppError(o.status, o.code ?? 'evidence_error', o.message);
  }
  throw e;
}

evidenceRouter.post(
  '/v1/evidence/items',
  requireAuth,
  requireEvidenceSync,
  requireEvidenceIdentity,
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const result = await createEvidenceItem(req.evidenceIdentity!, {
        organisationId: String(body.organisationId),
        localCaptureId: String(body.localCaptureId),
        testStepId: body.testStepId ? String(body.testStepId) : undefined,
        changeRecordId: body.changeRecordId ? String(body.changeRecordId) : undefined,
        title: body.title ? String(body.title) : undefined,
        localOriginalSha256: body.localOriginalSha256 ? String(body.localOriginalSha256) : undefined,
        metadata: (body.metadata as Record<string, unknown>) ?? {},
      });
      res.status(201).json(result);
    } catch (e) {
      errFromThrown(e);
    }
  }),
);

evidenceRouter.post(
  '/v1/evidence/items/:id/versions',
  requireAuth,
  requireEvidenceSync,
  requireEvidenceIdentity,
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const b64 = body.redactedPngBase64 ? String(body.redactedPngBase64) : '';
      if (!b64) throw new AppError(400, 'missing_image', 'redactedPngBase64 is required');
      const buf = Buffer.from(b64, 'base64');
      const result = await ingestRedactedVersion(req.evidenceIdentity!, routeParam(req.params.id), {
        redactedPng: buf,
        clientCapturedAt: body.clientCapturedAt ? String(body.clientCapturedAt) : undefined,
        piiRedacted: body.piiRedacted !== false,
        includesOcrText: Boolean(body.includesOcrText),
        includesUnredactedOriginal: Boolean(body.includesUnredactedOriginal),
      });
      res.status(201).json(result);
    } catch (e) {
      errFromThrown(e);
    }
  }),
);

evidenceRouter.get(
  '/v1/evidence/items/:id',
  requireAuth,
  requireEvidenceSync,
  requireEvidenceIdentity,
  asyncHandler(async (req, res) => {
    try {
      const data = await getItemWithVersions(req.evidenceIdentity!, routeParam(req.params.id));
      if (!data) throw new AppError(404, 'not_found', 'Evidence item not found');
      res.json(data);
    } catch (e) {
      errFromThrown(e);
    }
  }),
);

evidenceRouter.post(
  '/v1/evidence/packs',
  requireAuth,
  requireEvidenceSync,
  requireEvidenceIdentity,
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const ids = Array.isArray(body.evidenceItemIds) ? body.evidenceItemIds.map(String) : [];
      const result = await createPack(req.evidenceIdentity!, {
        organisationId: String(body.organisationId),
        title: String(body.title ?? 'Evidence pack'),
        evidenceItemIds: ids,
      });
      res.status(201).json(result);
    } catch (e) {
      errFromThrown(e);
    }
  }),
);

evidenceRouter.post(
  '/v1/evidence/packs/:id/signatures',
  requireAuth,
  requireEvidenceSync,
  requireEvidenceIdentity,
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const meaning = String(body.meaning ?? '') as 'author' | 'reviewer' | 'approver';
      if (!['author', 'reviewer', 'approver'].includes(meaning)) {
        throw new AppError(400, 'invalid_meaning', 'meaning must be author, reviewer, or approver');
      }
      const result = await signPack(req.evidenceIdentity!, routeParam(req.params.id), {
        meaning,
        reauthConfirmed: Boolean(body.reauthConfirmed),
      });
      res.status(201).json(result);
    } catch (e) {
      errFromThrown(e);
    }
  }),
);

evidenceRouter.get(
  '/v1/evidence/packs/:id/export',
  requireAuth,
  requireEvidenceSync,
  requireEvidenceIdentity,
  asyncHandler(async (req, res) => {
    try {
      const data = await exportPack(req.evidenceIdentity!, routeParam(req.params.id));
      res.json(data);
    } catch (e) {
      errFromThrown(e);
    }
  }),
);
