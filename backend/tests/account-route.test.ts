import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-account-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.DATA_DIR = dir;
process.env.AUTH_SECRET = 'test-account-secret';

const { initDb, _resetDb } = await import('../src/store');
const { issueBearerToken } = await import('../src/auth/sessions');
const { accounts } = await import('../src/accounts/store');

await initDb();
const { createApp } = await import('../src/index');
const app = createApp();

after(async () => {
  await _resetDb();
});

test('GET /v1/account returns email and tier for bearer', async () => {
  const acct = await accounts.getOrCreate('user@example.com', 'pro');
  const token = await issueBearerToken(acct.id);
  const res = await request(app).get('/v1/account').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'user@example.com');
  assert.equal(res.body.tier, 'pro');
  assert.equal(res.body.accountId, acct.id);
});

test('GET /v1/account without token is unauthorized', async () => {
  const res = await request(app).get('/v1/account');
  assert.equal(res.status, 401);
});
