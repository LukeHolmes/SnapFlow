// Headless tests for contextualise() — the core "Contextualise" stage.
// OCR is injected as a mock (fast stub) to avoid spinning up Tesseract's WASM worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/main/db';
import { HistoryStore } from '../src/main/history/store';
import { EventLog } from '../src/main/events/log';
import { entitlementsFor } from '../src/main/entitlements';
import { contextualise } from '../src/main/pipeline';
import type { Capture } from '../src/shared/types';

const VALID_TAGS = ['ui', 'code', 'chart', 'document', 'web'];
const WS = 'ws_pipeline';
const fastOcr = async (_: string) => ({ text: '' });              // mock — no Tesseract
const codeOcr = async (_: string) => ({ text: 'const x = 1;' }); // produces 'code' tag

function db() { return openDb(':memory:'); }

function capture(id = 'c1', path = '/dev/null'): Capture {
  return { id, workspaceId: WS, filename: 'test-cap', imagePath: path, tag: null, ocrText: '', hasPii: false, createdAt: Date.now() };
}

test('assigns a heuristic tag and emits capture + tag events (free tier)', async () => {
  const d = db(); const history = new HistoryStore(d); const events = new EventLog(d);
  const c = capture(); history.insert(c);

  const result = await contextualise(c, entitlementsFor('free'), history, events, fastOcr);

  assert.ok(VALID_TAGS.includes(result.tag!), `expected a valid tag, got "${result.tag}"`);
  assert.equal(result.hasPii, false);
  const ev = events.recent(WS, 10);
  assert.ok(ev.some(e => e.kind === 'capture'), 'should emit capture event');
  assert.ok(ev.some(e => e.kind === 'tag'),     'should always emit tag event even with no OCR text');
  assert.equal(ev.filter(e => e.kind === 'pii').length, 0);
});

test('heuristic classifies code-heavy OCR text as "code"', async () => {
  const d = db(); const history = new HistoryStore(d); const events = new EventLog(d);
  const c = capture('c2'); history.insert(c);
  const result = await contextualise(c, entitlementsFor('free'), history, events, codeOcr);
  assert.equal(result.tag, 'code');
});

test('PII in OCR text triggers a pii event', async () => {
  const d = db(); const history = new HistoryStore(d); const events = new EventLog(d);
  const c = capture('c3'); history.insert(c);
  const piiOcr = async () => ({ text: 'Contact: test@example.com for details' });
  const result = await contextualise(c, entitlementsFor('free'), history, events, piiOcr);
  assert.equal(result.hasPii, true);
  const ev = events.recent(WS, 10);
  assert.ok(ev.some(e => e.kind === 'pii'), 'should emit pii event when PII is detected');
});

test('marks the capture dirty for sync after analysis', async () => {
  const d = db(); const history = new HistoryStore(d); const events = new EventLog(d);
  const c = capture('c4'); history.insert(c);
  await contextualise(c, entitlementsFor('free'), history, events, fastOcr);
  const dirty = history.dirty(WS);
  assert.equal(dirty.length, 1);
  assert.ok(dirty[0].tag, 'dirty record should carry the assigned tag');
});

test('completes without throwing when imagePath does not exist', async () => {
  const d = db(); const history = new HistoryStore(d); const events = new EventLog(d);
  const c = capture('c5', '/nonexistent/path.png'); history.insert(c);
  await assert.doesNotReject(
    () => contextualise(c, entitlementsFor('free'), history, events, fastOcr)
  );
});
