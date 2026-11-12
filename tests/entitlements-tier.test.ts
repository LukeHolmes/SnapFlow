import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let currentTier: typeof import('../src/main/entitlements/tier').currentTier;
let tierFromDevEnv: typeof import('../src/main/entitlements/tier').tierFromDevEnv;

before(async () => {
  process.env.SNAPFLOW_TEST_HARNESS = '1';
  const mod = await import('../src/main/entitlements/tier');
  currentTier = mod.currentTier;
  tierFromDevEnv = mod.tierFromDevEnv;
});

test('currentTier defaults to free without env override', () => {
  delete process.env.SNAPFLOW_TIER;
  assert.equal(currentTier(), 'free');
});

test('tierFromDevEnv honors SNAPFLOW_TIER in dev harness', () => {
  process.env.SNAPFLOW_TIER = 'pro';
  assert.equal(tierFromDevEnv(), 'pro');
  delete process.env.SNAPFLOW_TIER;
  assert.equal(tierFromDevEnv(), null);
});

test('tierFromDevEnv rejects unknown tiers', () => {
  process.env.SNAPFLOW_TIER = 'enterprise';
  assert.equal(tierFromDevEnv(), null);
  delete process.env.SNAPFLOW_TIER;
});
