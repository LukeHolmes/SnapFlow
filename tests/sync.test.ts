import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/main/db';
import { HistoryStore } from '../src/main/history/store';
import type { Capture, SyncRecord } from '../src/shared/types';

const WS = 'ws_local';
const cap = (id: string, createdAt = Date.now()): Capture => ({
  id, workspaceId: WS, filename: `cap-${id}`, imagePath: `/tmp/${id}.png`,
  tag: 'ui', ocrText: 'hello', hasPii: false, createdAt,
});
const remote = (id: string, updatedAt: number, extra: Partial<SyncRecord> = {}): SyncRecord => ({
  id, workspaceId: WS, filename: `remote-${id}`, tag: 'code', ocrText: 'remote text',
  hasPii: false, createdAt: 1000, updatedAt, deleted: false, ...extra,
});
const store = () => new HistoryStore(openDb(':memory:'));

test('a new local capture is dirty until marked clean', () => {
  const s = store();
  s.insert(cap('a'));
  const dirty = s.dirty(WS);
  assert.equal(dirty.length, 1);
  assert.equal(dirty[0].id, 'a');
  assert.equal(dirty[0].deleted, false);
  s.markClean(['a']);
  assert.equal(s.dirty(WS).length, 0);
});

test('upsertRemote inserts a remote-origin capture (clean, no local image)', () => {
  const s = store();
  s.upsertRemote(remote('r1', 500));
  const got = s.get(WS, 'r1');
  assert.ok(got);
  assert.equal(got!.imagePath, '');         // image fetched lazily
  assert.equal(s.dirty(WS).length, 0);      // pulled rows are not dirty
  assert.deepEqual(s.missingImages(WS), ['r1']);
});

test('last-write-wins: older remote is ignored, newer applies', () => {
  const s = store();
  s.upsertRemote(remote('x', 500, { filename: 'v500' }));
  s.upsertRemote(remote('x', 400, { filename: 'v400' }));   // older → ignored
  assert.equal(s.get(WS, 'x')!.filename, 'v500');
  s.upsertRemote(remote('x', 600, { filename: 'v600' }));   // newer → wins
  assert.equal(s.get(WS, 'x')!.filename, 'v600');
});

test('soft delete tombstones the row and hides it from reads', () => {
  const s = store();
  s.insert(cap('d'));
  s.markClean(['d']);
  s.delete(WS, 'd');
  assert.equal(s.get(WS, 'd'), undefined);          // hidden from reads
  assert.equal(s.list(WS).find(c => c.id === 'd'), undefined);
  const dirty = s.dirty(WS);
  assert.equal(dirty.length, 1);
  assert.equal(dirty[0].deleted, true);             // tombstone queued for push
});

test('a remote tombstone removes a previously visible capture', () => {
  const s = store();
  s.upsertRemote(remote('t', 100));
  assert.ok(s.get(WS, 't'));
  s.upsertRemote(remote('t', 200, { deleted: true }));
  assert.equal(s.get(WS, 't'), undefined);
});

test('cursor persists and lazy image path resolves', () => {
  const s = store();
  assert.equal(s.getCursor(WS), 0);
  s.setCursor(WS, 42);
  assert.equal(s.getCursor(WS), 42);
  s.upsertRemote(remote('img', 10));
  assert.deepEqual(s.missingImages(WS), ['img']);
  s.setImagePath('img', '/tmp/img.png');
  assert.deepEqual(s.missingImages(WS), []);
});
