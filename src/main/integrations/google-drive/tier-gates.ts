import type { Entitlements } from '../../../shared/types';

/** Manual “Send to Drive” is available on all tiers (see entitlements). */
export function canUseGoogleDriveManualSend(): boolean {
  return true;
}

/** Pro/Team hook: per-folder auto-upload rules (not implemented in v1). */
export function canUseGoogleDriveAutoRules(ent: Entitlements): boolean {
  return ent.tier === 'pro' || ent.tier === 'team';
}

/** Pro/Team hook: watch folders and upload on capture (not implemented). */
export function canUseGoogleDriveWatchFolders(ent: Entitlements): boolean {
  return ent.tier === 'pro' || ent.tier === 'team';
}
