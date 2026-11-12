import type { Tier } from '../../shared/types';

const VALID_TIERS: Tier[] = ['free', 'pro', 'team', 'perpetual'];

/** True when the desktop build is unpackaged (dev) or running under the node test runner. */
export function isDevEnvironment(): boolean {
  if (process.env.SNAPFLOW_TEST_HARNESS === '1') return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron');
    return !app.isPackaged;
  } catch {
    return true;
  }
}

/**
 * SNAPFLOW_TIER env override — only honored in dev/unpackaged builds.
 * Returns null when unset or not allowed.
 */
export function tierFromDevEnv(): Tier | null {
  if (!isDevEnvironment()) return null;
  const t = process.env.SNAPFLOW_TIER as Tier | undefined;
  if (!t || !VALID_TIERS.includes(t)) return null;
  return t;
}

export function currentTier(): Tier {
  return tierFromDevEnv() ?? 'free';
}
