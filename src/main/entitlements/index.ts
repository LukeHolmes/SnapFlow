// Tier & entitlement model (architecture §8, §11).
//
// IMPORTANT: limits enforced here are the CLIENT-SIDE half only — local-only
// limits such as preset count and history window. Anything that costs money
// (AI calls, cloud storage, shared libraries) must additionally be gated
// SERVER-SIDE by the backend, which is the single source of truth. The desktop
// app must never be the sole enforcement point for paid capabilities.

import type { Entitlements, Tier } from '../../shared/types';

const TABLE: Record<Tier, Omit<Entitlements, 'tier'>> = {
  free:      { historyWindowDays: 30,   maxPresets: 1,    aiEnabled: false, cloudSync: false },
  pro:       { historyWindowDays: null, maxPresets: 5,    aiEnabled: true,  cloudSync: true  },
  team:      { historyWindowDays: null, maxPresets: null, aiEnabled: true,  cloudSync: true  },
  // Perpetual: paid, non-recurring, AI-enabled, local (resolves the §11 contradiction).
  perpetual: { historyWindowDays: null, maxPresets: 5,    aiEnabled: true,  cloudSync: false },
};

export function entitlementsFor(tier: Tier): Entitlements {
  return { tier, ...TABLE[tier] };
}

/** Dev convenience: tier comes from env, defaults to pro. Real builds read it from the backend. */
export function currentTier(): Tier {
  const t = (process.env.SNAPFLOW_TIER as Tier) || 'pro';
  return (['free', 'pro', 'team', 'perpetual'] as Tier[]).includes(t) ? t : 'pro';
}

export function canAddPreset(ent: Entitlements, currentCount: number): boolean {
  return ent.maxPresets == null || currentCount < ent.maxPresets;
}
