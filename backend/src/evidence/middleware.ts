import type { Request, Response, NextFunction } from 'express';
import { entitlementsFor } from '../entitlements';
import { effectiveTierForAccount } from '../entitlements/resolve';
import { AppError, asyncHandler } from '../errors';
import { loadIdentity } from './identity';
import { evidenceConfig } from './config';
import type { EvidenceIdentity } from './identity';

declare global {
  namespace Express {
    interface Request {
      evidenceIdentity?: EvidenceIdentity;
    }
  }
}

export const requireEvidenceSync = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const tier = await effectiveTierForAccount(req.account!.id);
  if (!entitlementsFor(tier).cloudSync) {
    throw new AppError(402, 'evidence_sync_not_entitled', 'Cloud evidence sync requires a Pro or Team plan');
  }
  if (!evidenceConfig.enabled && process.env.EVIDENCE_TEST_MOCK !== '1') {
    throw new AppError(503, 'evidence_unconfigured', 'Evidence backend is not configured');
  }
  next();
});

export const requireEvidenceIdentity = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const identity = await loadIdentity(req.account!.id);
  if (!identity) {
    throw new AppError(403, 'evidence_identity_missing', 'Link this account to a GxP evidence organisation (evidence_bff_identities)');
  }
  req.evidenceIdentity = identity;
  next();
});
