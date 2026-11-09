// SERVER-AUTHORITATIVE entitlements (architecture §5.5, §8). This is the single
// source of truth for paid capabilities; the desktop client mirror is UX-only.
import type { Tier } from '../accounts/store';
import { ENTITLEMENTS_MATRIX } from '../../../shared/entitlements-matrix';

export interface Entitlements {
  tier: Tier;
  historyWindowDays: number | null;
  maxPresets: number | null;
  aiEnabled: boolean;
  cloudSync: boolean;
  sharedLibrary: boolean;   // Team shared capture library + server-side search (§5.6)
}

export const entitlementsFor = (tier: Tier): Entitlements => {
  const row = ENTITLEMENTS_MATRIX[tier];
  return {
    tier,
    historyWindowDays: row.historyWindowDays,
    maxPresets: row.maxPresets,
    aiEnabled: row.aiEnabled,
    cloudSync: row.cloudSync,
    sharedLibrary: row.sharedLibrary,
  };
};
