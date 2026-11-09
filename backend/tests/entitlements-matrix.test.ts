import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTITLEMENTS_MATRIX } from '../../shared/entitlements-matrix';
import { entitlementsFor as serverEntitlements } from '../src/entitlements';

test('backend entitlements use the shared matrix (server-gated fields)', () => {
  for (const tier of ['free', 'pro', 'team', 'perpetual'] as const) {
    const row = ENTITLEMENTS_MATRIX[tier];
    const e = serverEntitlements(tier);
    assert.equal(e.historyWindowDays, row.historyWindowDays, tier);
    assert.equal(e.maxPresets, row.maxPresets, tier);
    assert.equal(e.aiEnabled, row.aiEnabled, tier);
    assert.equal(e.cloudSync, row.cloudSync, tier);
    assert.equal(e.sharedLibrary, row.sharedLibrary, tier);
  }
});
