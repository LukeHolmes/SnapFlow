import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate DB + blob storage BEFORE importing modules that read config.
const dir = mkdtempSync(join(tmpdir(), 'snapflow-sync-'));
process.env.DATABASE_URL = '';            // force SQLite
process.env.DB_PATH = join(dir, 'test.db');
process.env.DATA_DIR = dir;
const { sync } = await import('../src/sync/store');
const { initDb } = await import('../src/store');
await initDb();

const rec = (id: string, updatedAt: number, extra: Partial<{ deleted: boolean; filename: string; workspaceId: string; ocrText: string }> = {}) => ({
  id, workspaceId: extra.workspaceId ?? 'ws_local', filename: extra.filename ?? `cap-${id}`,
  tag: null, ocrText: extra.ocrText ?? '', hasPii: false, createdAt: 1000, updatedAt, deleted: extra.deleted ?? false,
});

test('push then pull returns records and advances the cursor', async () => {
  const acc = 'acc_a';
  const { applied, cursor } = await sync.push(acc, [rec('x', 100), rec('y', 100)]);
  assert.equal(applied, 2);
  assert.equal(cursor, 2);
  const pulled = await sync.pull(acc, 'ws_local', 0);
  assert.equal(pulled.records.length, 2);
  assert.equal(pulled.cursor, 2);
  assert.equal((await sync.pull(acc, 'ws_local', pulled.cursor)).records.length, 0);
});

test('last-write-wins: older ignored, newer applies', async () => {
  const acc = 'acc_b';
  await sync.push(acc, [rec('x', 200, { filename: 'newer' })]);
  assert.equal((await sync.push(acc, [rec('x', 150, { filename: 'older' })])).applied, 0);
  assert.equal((await sync.pull(acc, 'ws_local', 0)).records[0].filename, 'newer');
  assert.equal((await sync.push(acc, [rec('x', 300, { filename: 'newest' })])).applied, 1);
  const rows = (await sync.pull(acc, 'ws_local', 0)).records;
  assert.equal(rows[rows.length - 1].filename, 'newest');
});

test('tombstones propagate', async () => {
  const acc = 'acc_c';
  await sync.push(acc, [rec('x', 100)]);
  await sync.push(acc, [rec('x', 200, { deleted: true })]);
  const rows = (await sync.pull(acc, 'ws_local', 0)).records;
  assert.equal(rows[rows.length - 1].deleted, true);
});

test('pull is workspace-scoped', async () => {
  const acc = 'acc_d';
  await sync.push(acc, [rec('x', 100, { workspaceId: 'ws_1' }), rec('y', 100, { workspaceId: 'ws_2' })]);
  const ws1 = (await sync.pull(acc, 'ws_1', 0)).records;
  assert.equal(ws1.length, 1);
  assert.equal(ws1[0].workspaceId, 'ws_1');
});

test('blob round-trips through storage', async () => {
  const acc = 'acc_e';
  await sync.putBlob(acc, 'x', Buffer.from('hello png bytes').toString('base64'));
  const got = await sync.getBlob(acc, 'x');
  assert.equal(Buffer.from(got!, 'base64').toString(), 'hello png bytes');
  assert.equal(await sync.getBlob(acc, 'missing'), null);
});

test('server-side search spans the workspace and matches filename + OCR text', async () => {
  // Two different team members (accounts) push into the same shared workspace.
  await sync.push('member_1', [rec('s1', 100, { workspaceId: 'ws_team', filename: 'Login bug', ocrText: 'NullPointerException at auth' })]);
  await sync.push('member_2', [rec('s2', 100, { workspaceId: 'ws_team', filename: 'Checkout', ocrText: 'payment declined error' })]);
  const byOcr = await sync.searchWorkspace('ws_team', 'nullpointer');
  assert.equal(byOcr.length, 1);
  assert.equal(byOcr[0].id, 's1');
  const byName = await sync.searchWorkspace('ws_team', 'checkout');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, 's2');
  // deleted rows are excluded
  await sync.push('member_1', [rec('s1', 200, { workspaceId: 'ws_team', deleted: true, filename: 'Login bug', ocrText: 'NullPointerException at auth' })]);
  assert.equal((await sync.searchWorkspace('ws_team', 'nullpointer')).length, 0);
});
