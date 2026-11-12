import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/main/db';
import { entitlementsFor } from '../src/main/entitlements';
import { cloudAiGate } from '../src/main/ai/cloud-guard';
import { setAiTaggingOptIn } from '../src/main/prefs/ai-tagging';
import type { Capture } from '../src/shared/types';

const cap = (hasPii: boolean, redacted = false): Capture => ({
  id: 'c1',
  workspaceId: 'ws',
  filename: 'f',
  imagePath: '/x',
  kind: 'screenshot',
  tag: null,
  ocrText: '',
  hasPii,
  piiRedactedApplied: redacted,
  createdAt: Date.now(),
});

test('cloudAiGate blocks when opt-in is off', () => {
  const db = openDb(':memory:');
  const r = cloudAiGate(db, entitlementsFor('pro'), [cap(false)]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'opt_in');
});

test('cloudAiGate blocks PII unless pixels were redacted', () => {
  const db = openDb(':memory:');
  setAiTaggingOptIn(db, true);
  const blocked = cloudAiGate(db, entitlementsFor('pro'), [cap(true)]);
  assert.equal(blocked.ok, false);
  const allowed = cloudAiGate(db, entitlementsFor('pro'), [cap(true, true)]);
  assert.equal(allowed.ok, true);
});

test('cloudAiGate blocks free tier', () => {
  const db = openDb(':memory:');
  setAiTaggingOptIn(db, true);
  const r = cloudAiGate(db, entitlementsFor('free'), [cap(false)]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'tier');
});
