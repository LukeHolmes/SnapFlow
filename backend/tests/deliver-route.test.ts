import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = '';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'snapflow-deliver-route-')), 'test.db');

const { initDb } = await import('../src/store');
const { issueBearerToken } = await import('../src/auth/sessions');
const { accounts } = await import('../src/accounts/store');
const { createApp } = await import('../src/index');

await initDb();
const app = createApp();
const { default: supertest } = await import('supertest');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==').toString('base64');

test('POST /v1/deliver returns 402 for free tier', async () => {
  const acct = await accounts.getOrCreate('free-deliver@test.com', 'free');
  const token = await issueBearerToken(acct.id);
  const r = await supertest(app)
    .post('/v1/deliver')
    .set('authorization', `Bearer ${token}`)
    .send({
      destination: 'slack',
      imageBase64: png,
      captureId: 'cap_1',
      workspaceId: 'ws_local',
      config: { channel_id: 'C1' },
    });
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'deliver_not_entitled');
});

test('POST /v1/deliver passes tier gate for pro (may fail without vault)', async () => {
  const acct = await accounts.getOrCreate('pro-deliver@test.com', 'pro');
  const token = await issueBearerToken(acct.id);
  const r = await supertest(app)
    .post('/v1/deliver')
    .set('authorization', `Bearer ${token}`)
    .send({
      destination: 'slack',
      imageBase64: png,
      captureId: 'cap_2',
      workspaceId: 'ws_local',
      config: { channel_id: 'C1' },
    });
  assert.notEqual(r.status, 402);
});
