import type { Capture } from '../../shared/types';
import type { Entitlements } from '../../shared/types';
import type { Db } from '../db';
import { isAiTaggingOptIn } from '../prefs/ai-tagging';

export type CloudAiBlockReason = 'opt_in' | 'tier' | 'pii';

export function cloudAiGate(
  db: Db,
  ent: Entitlements,
  captures: Capture[],
): { ok: true } | { ok: false; reason: CloudAiBlockReason; error: string } {
  if (!isAiTaggingOptIn(db)) {
    return { ok: false, reason: 'opt_in', error: 'Cloud AI is off. Enable it in Account settings.' };
  }
  if (!ent.aiEnabled) {
    return { ok: false, reason: 'tier', error: 'Cloud AI requires a Pro or Team plan.' };
  }
  if (captures.some(c => c.hasPii && !c.piiRedactedApplied)) {
    return { ok: false, reason: 'pii', error: 'Redact PII before sending captures to cloud AI.' };
  }
  return { ok: true };
}
