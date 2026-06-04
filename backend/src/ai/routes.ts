// The metered AI proxy (architecture §5.4). The linchpin of the cost model:
// authenticate -> check entitlement -> rate-limit -> meter -> forward. The vision
// API key lives ONLY here; Free tier is rejected before any model call.
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { entitlementsFor } from '../entitlements/index';
import { classifyImage, summariseDiff } from './vision';
import { meter } from './meter';
import { allow } from '../rate-limit';
import { config } from '../config';
import { AppError, asyncHandler } from '../errors';

export const aiRouter = Router();

aiRouter.post('/v1/ai/tag', requireAuth, asyncHandler(async (req, res) => {
  const account = req.account!;
  const ent = entitlementsFor(account.tier);
  if (!ent.aiEnabled) throw new AppError(402, 'ai_not_entitled', 'AI features require a paid tier');
  if (!allow(account.id, config.aiRatePerMin)) throw new AppError(429, 'rate_limited', 'Too many AI requests — slow down');

  const imageBase64 = req.body?.imageBase64 as string | undefined;
  if (!imageBase64) throw new AppError(400, 'bad_request', 'imageBase64 is required');

  const tag = await classifyImage(imageBase64);
  const usage = await meter.increment(account.id);
  res.json({ tag, usage });
}));

aiRouter.post('/v1/ai/diff', requireAuth, asyncHandler(async (req, res) => {
  const account = req.account!;
  const ent = entitlementsFor(account.tier);
  if (!ent.aiEnabled) throw new AppError(402, 'ai_not_entitled', 'Diff mode requires a paid tier');
  if (!allow(account.id, config.aiRatePerMin)) throw new AppError(429, 'rate_limited', 'Too many AI requests');

  const { beforeBase64, afterBase64 } = req.body ?? {};
  if (!beforeBase64 || !afterBase64) throw new AppError(400, 'bad_request', 'beforeBase64 and afterBase64 are required');

  const summary = await summariseDiff(beforeBase64 as string, afterBase64 as string);
  await meter.increment(account.id);
  res.json({ summary });
}));
