import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCS_ENTITLEMENTS_MATRIX, ENTITLEMENTS_MATRIX } from '../shared/entitlements-matrix';
import { entitlementsFor as desktopEntitlements } from '../src/main/entitlements';

test('shared matrix matches documented v1.1 tier gates', () => {
  assert.deepEqual(ENTITLEMENTS_MATRIX, DOCS_ENTITLEMENTS_MATRIX);
});

test('desktop entitlements mirror the shared matrix', () => {
  for (const tier of ['free', 'pro', 'team', 'perpetual'] as const) {
    const { tier: _t, ...desktop } = desktopEntitlements(tier);
    assert.deepEqual(desktop, ENTITLEMENTS_MATRIX[tier], `desktop tier ${tier}`);
  }
});
