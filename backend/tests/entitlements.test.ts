import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlementsFor } from '../src/entitlements/index';

test('free tier has no AI and a 30-day window', () => {
  const e = entitlementsFor('free');
  assert.equal(e.aiEnabled, false);
  assert.equal(e.historyWindowDays, 30);
});
test('pro and team enable AI', () => {
  assert.equal(entitlementsFor('pro').aiEnabled, true);
  assert.equal(entitlementsFor('team').maxPresets, null);
});
test('perpetual is AI-enabled but non-cloud', () => {
  const e = entitlementsFor('perpetual');
  assert.equal(e.aiEnabled, true);
  assert.equal(e.cloudSync, false);
});
