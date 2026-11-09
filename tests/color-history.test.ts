import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/main/db';
import { ColorHistoryStore } from '../src/main/history/color-store';

function freshColors() {
  const db = openDb(join(tmpdir(), `snapflow-color-${randomUUID()}.db`));
  return new ColorHistoryStore(db);
}

test('stores recent colours with dedupe by hex', () => {
  const store = freshColors();
  const ws = 'ws_test';
  const a = store.add(ws, '#4F46E5', { r: 79, g: 70, b: 229 });
  const b = store.add(ws, '#4f46e5', { r: 79, g: 70, b: 229 });
  assert.equal(a.id, b.id);
  const list = store.list(ws);
  assert.equal(list.length, 1);
  assert.equal(list[0].hex, '#4F46E5');
});

test('clipboard format preference persists', () => {
  const store = freshColors();
  assert.equal(store.getFormat(), 'hex');
  store.setFormat('hsl');
  assert.equal(store.getFormat(), 'hsl');
  store.setFormat('rgb');
  assert.equal(store.getFormat(), 'rgb');
});

test('trims history to the most recent entries', () => {
  const store = freshColors();
  const ws = 'ws_trim';
  for (let i = 0; i < 40; i += 1) {
    const v = i.toString(16).padStart(2, '0');
    store.add(ws, `#${v}${v}${v}`, { r: i, g: i, b: i });
  }
  assert.equal(store.list(ws, 50).length, 32);
});
