import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/main/db';
import { HistoryStore } from '../src/main/history/store';
import { EventLog } from '../src/main/events/log';
import { entitlementsFor } from '../src/main/entitlements';
import { contextualise } from '../src/main/pipeline';
import { setAiTaggingOptIn } from '../src/main/prefs/ai-tagging';
import type { Capture } from '../src/shared/types';

const WS = 'ws_ai_opt';
const fastOcr = async () => ({ text: 'dashboard submit button' });

test('contextualise does not call cloud AI without opt-in (heuristic tag only)', async () => {
  const db = openDb(':memory:');
  const history = new HistoryStore(db);
  const events = new EventLog(db);
  const c: Capture = {
    id: 'c1', workspaceId: WS, filename: 't', imagePath: '/dev/null', kind: 'screenshot',
    tag: null, ocrText: '', hasPii: false, createdAt: Date.now(),
  };
  history.insert(c);
  const result = await contextualise(c, entitlementsFor('pro'), history, events, fastOcr, { aiTaggingEnabled: false });
  assert.ok(result.tag);
});

test('contextualise skips cloud AI when PII detected even if opted in', async () => {
  const db = openDb(':memory:');
  setAiTaggingOptIn(db, true);
  const history = new HistoryStore(db);
  const events = new EventLog(db);
  const c: Capture = {
    id: 'c2', workspaceId: WS, filename: 't', imagePath: '/dev/null', kind: 'screenshot',
    tag: null, ocrText: '', hasPii: false, createdAt: Date.now(),
  };
  history.insert(c);
  const piiOcr = async () => ({ text: 'email test@example.com' });
  const result = await contextualise(c, entitlementsFor('pro'), history, events, piiOcr, { aiTaggingEnabled: true });
  assert.equal(result.hasPii, true);
  assert.ok(result.tag, 'heuristic tag assigned without cloud AI');
});
