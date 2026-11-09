import type { Request, Response, NextFunction } from 'express';
import { entitlementsFor, type Entitlements } from './index';
import { effectiveTierForAccount } from './resolve';
import { asyncHandler } from '../errors';

export async function effectiveEntitlementsForRequest(req: Request): Promise<Entitlements> {
  const tier = await effectiveTierForAccount(req.account!.id);
  return entitlementsFor(tier);
}

export function requireEntitlement(check: (ent: Entitlements) => boolean, code: string, message: string) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const ent = await effectiveEntitlementsForRequest(req);
    if (!check(ent)) {
      const { AppError } = await import('../errors');
      throw new AppError(402, code, message);
    }
    next();
  });
}
