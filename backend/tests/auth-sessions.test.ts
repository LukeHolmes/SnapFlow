import { test } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-auth-sess-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.DEV_LOGIN = 'true';
process.env.AUTH_SECRET = 'test-auth-sessions-secret-minimum-length-ok';

const { initDb, _resetDb } = await import('../src/store');
const { accounts } = await import('../src/accounts/store');
const { createApp } = await import('../src/index');
const { mintAuthCredentials, refreshAuthCredentials, issueBearerToken } = await import('../src/auth/sessions');
const { verifyAccessToken } = await import('../src/auth/tokens');
await initDb();
const app = createApp();

test('mint, refresh rotation, and revoke invalidate bearer', async () => {
  const account = await accounts.getOrCreate('revoke@test.local', 'pro');
  const first = await mintAuthCredentials(account.id);
  assert.ok(verifyAccessToken(first.accessToken));

  const refreshed = await refreshAuthCredentials(first.refreshToken);
  assert.notEqual(refreshed.refreshToken, first.refreshToken);
  assert.ok(verifyAccessToken(refreshed.accessToken));

  await assert.rejects(() => refreshAuthCredentials(first.refreshToken), /invalid/i);

  const revoke = await (supertest(app) as any)
    .post('/v1/auth/revoke')
    .set('authorization', `Bearer ${refreshed.accessToken}`)
    .send();
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.ok, true);

  const blocked = await (supertest(app) as any)
    .get('/v1/entitlements')
    .set('authorization', `Bearer ${refreshed.accessToken}`);
  assert.equal(blocked.status, 401);
});

test('dev POST /auth/token returns access + refresh', async () => {
  const r = await (supertest(app) as any).post('/auth/token').send({ email: 'dev-token@test.local', tier: 'pro' });
  assert.equal(r.status, 200);
  assert.ok(r.body.accessToken);
  assert.ok(r.body.refreshToken);
  assert.ok(r.body.expiresIn);
});

test('issueBearerToken works after initDb', async () => {
  const account = await accounts.getOrCreate('bearer@test.local', 'free');
  const token = await issueBearerToken(account.id);
  const claim = verifyAccessToken(token);
  assert.equal(claim?.accountId, account.id);
});

test('cleanup db', async () => {
  await _resetDb();
});
