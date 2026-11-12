import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './tokens';
import { isSessionActive } from './sessions';
import { accounts, type Account } from '../accounts/store';
import { AppError, asyncHandler } from '../errors';

declare global { namespace Express { interface Request { account?: Account } } }

// Async (account lookup hits the store); asyncHandler routes throws to the error middleware.
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claim = token ? verifyAccessToken(token) : null;
  if (!claim) throw new AppError(401, 'unauthorized', 'Missing or invalid bearer token');
  if (!(await isSessionActive(claim.sessionId, claim.accountId))) {
    throw new AppError(401, 'session_revoked', 'Session has been revoked or is unknown');
  }
  const account = await accounts.get(claim.accountId);
  if (!account) throw new AppError(401, 'unauthorized', 'Account not found');
  req.account = account;
  next();
});
