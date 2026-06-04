import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/main/db';
import { HistoryStore } from '../src/main/history/store';
import { EventLog } from '../src/main/events/log';
import type { Capture } from '../src/shared/types';

function freshStore() {
  const db = openDb(join(tmpdir(), `snapflow-test-${randomUUID()}.db`));
  return { history: new HistoryStore(db), events: new EventLog(db) };
}
const cap = (over: Partial<Capture>): Capture => ({
  id: randomUUID(), workspaceId: 'ws_a', filename: 'shot', imagePath: '/x.png',
  tag: 'ui', ocrText: '', hasPii: false, createdAt: Date.now(), ...over,
});

test('insert + FTS5 search finds by OCR text', () => {
  const { history } = freshStore();
  history.insert(cap({ filename: 'API error log', ocrText: 'TypeError cannot read property id', tag: 'code' }));
  history.insert(cap({ filename: 'Q3 revenue', ocrText: 'revenue up 18% YoY', tag: 'chart' }));
  const hits = history.search('ws_a', 'revenue');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].filename, 'Q3 revenue');
  assert.ok(hits[0].snippet?.includes('['));
});

test('search is scoped to one workspace (tenant isolation)', () => {
  const { history } = freshStore();
  history.insert(cap({ workspaceId: 'ws_a', ocrText: 'shared secret token' }));
  history.insert(cap({ workspaceId: 'ws_b', ocrText: 'shared secret token' }));
  assert.equal(history.search('ws_a', 'secret').length, 1);
  assert.equal(history.search('ws_b', 'secret').length, 1);
  assert.equal(history.search('ws_c', 'secret').length, 0);
});

test('delete keeps the FTS index in sync', () => {
  const { history } = freshStore();
  const c = cap({ ocrText: 'findme unique' });
  history.insert(c);
  assert.equal(history.search('ws_a', 'findme').length, 1);
  history.delete('ws_a', c.id);
  assert.equal(history.search('ws_a', 'findme').length, 0);
});

test('updateAnalysis re-indexes OCR text', () => {
  const { history } = freshStore();
  const c = cap({ ocrText: '' });
  history.insert(c);
  assert.equal(history.search('ws_a', 'invoice').length, 0);
  history.updateAnalysis(c.id, 'invoice total 1200', 'document', false);
  assert.equal(history.search('ws_a', 'invoice').length, 1);
});

test('free-tier retention sweep returns files to unlink', () => {
  const { history } = freshStore();
  history.insert(cap({ createdAt: Date.now() - 40 * 86_400_000, imagePath: '/old.png' }));
  history.insert(cap({ createdAt: Date.now(), imagePath: '/new.png' }));
  const purged = history.applyRetention('ws_a', 30);
  assert.deepEqual(purged, ['/old.png']);
  assert.equal(history.list('ws_a').length, 1);
});

test('stats count totals, OCR, and PII correctly', () => {
  const { history } = freshStore();
  history.insert(cap({ ocrText: 'has text', hasPii: true }));
  history.insert(cap({ ocrText: '', hasPii: false }));
  const s = history.stats('ws_a');
  assert.equal(s.total, 2);
  assert.equal(s.ocrIndexed, 1);
  assert.equal(s.piiRedacted, 1);
});
