import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlementsFor, canAddPreset, canAddFocusBlurRegion, canUseFocusBlurPresetAutomation } from '../src/main/entitlements';

test('free tier: 30-day history, 1 preset, no AI, basic diff only', () => {
  const e = entitlementsFor('free');
  assert.equal(e.historyWindowDays, 30);
  assert.equal(e.maxPresets, 1);
  assert.equal(e.aiEnabled, false);
  assert.equal(e.diffAdvanced, false);
});

test('pro tier: unlimited history, 5 presets, AI on, advanced diff', () => {
  const e = entitlementsFor('pro');
  assert.equal(e.historyWindowDays, null);
  assert.equal(e.maxPresets, 5);
  assert.equal(e.aiEnabled, true);
  assert.equal(e.diffAdvanced, true);
});

test('perpetual: AI-enabled, non-cloud, 5 presets (resolves §11 contradiction)', () => {
  const e = entitlementsFor('perpetual');
  assert.equal(e.aiEnabled, true);
  assert.equal(e.cloudSync, false);
  assert.equal(e.maxPresets, 5);
});

test('preset limit enforcement', () => {
  assert.equal(canAddPreset(entitlementsFor('free'), 1), false);
  assert.equal(canAddPreset(entitlementsFor('pro'), 4), true);
  assert.equal(canAddPreset(entitlementsFor('team'), 999), true); // unlimited
});

test('focus blur entitlements', () => {
  assert.equal(entitlementsFor('free').focusBlurMaxRegions, 1);
  assert.equal(canAddFocusBlurRegion(entitlementsFor('free'), 0), true);
  assert.equal(canUseFocusBlurPresetAutomation(entitlementsFor('pro')), true);
  assert.equal(canUseFocusBlurPresetAutomation(entitlementsFor('free')), false);
});
