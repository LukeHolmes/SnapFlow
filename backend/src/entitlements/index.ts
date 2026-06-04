// SERVER-AUTHORITATIVE entitlements (architecture §5.5, §8). This is the single
// source of truth for paid capabilities; the desktop client mirror is UX-only.
import type { Tier } from '../accounts/store';

export interface Entitlements {
  tier: Tier;
  historyWindowDays: number | null;
  maxPresets: number | null;
  aiEnabled: boolean;
  cloudSync: boolean;
  sharedLibrary: boolean;   // Team shared capture library + server-side search (§5.6)
}

const TABLE: Record<Tier, Omit<Entitlements, 'tier'>> = {
  free:      { historyWindowDays: 30,   maxPresets: 1,    aiEnabled: false, cloudSync: false, sharedLibrary: false },
  pro:       { historyWindowDays: null, maxPresets: 5,    aiEnabled: true,  cloudSync: true,  sharedLibrary: false },
  team:      { historyWindowDays: null, maxPresets: null, aiEnabled: true,  cloudSync: true,  sharedLibrary: true  },
  perpetual: { historyWindowDays: null, maxPresets: 5,    aiEnabled: true,  cloudSync: false, sharedLibrary: false },
};

export const entitlementsFor = (tier: Tier): Entitlements => ({ tier, ...TABLE[tier] });
