import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-signed-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.DATA_DIR = dir;
process.env.AUTH_SECRET = 'test-signing-secret';
process.env.PUBLIC_BASE_URL = 'http://localhost:3999';
process.env.SIGNED_URL_TTL_MS = '3600000';

const { initDb, _resetDb } = await import('../src/store');
const { _resetBlobStorage } = await import('../src/storage');
const { sync } = await import('../src/sync/store');
const { buildCaptureUrl, verifyCaptureSignature } = await import('../src/storage/signed-url');
const { issueBearerToken } = await import('../src/auth/sessions');
const { accounts } = await import('../src/accounts/store');

await initDb();

const { createApp } = await import('../src/index');
const app = createApp();

async function bearerFor(tier: 'free' | 'pro' = 'pro'): Promise<{ token: string; accountId: string }> {
  const account = await accounts.getOrCreate(`${tier}-signed@test.local`, tier);
  return { token: await issueBearerToken(account.id), accountId: account.id };
}

after(async () => {
  await _resetDb();
  _resetBlobStorage();
});

test('signed URL verify accepts valid signature and rejects tamper/expiry', () => {
  const exp = Date.now() + 60_000;
  const signed = buildCaptureUrl('acc_1', 'cap_1', exp);
  const url = new URL(signed);
  const verdict = verifyCaptureSignature('acc_1', 'cap_1', Number(url.searchParams.get('exp')), url.searchParams.get('sig')!);
  assert.equal(verdict.ok, true);
  const tampered = verifyCaptureSignature('acc_1', 'cap_1', exp, '0'.repeat(64));
  assert.equal(tampered.ok, false);
  const expired = verifyCaptureSignature('acc_1', 'cap_1', Date.now() - 1, url.searchParams.get('sig')!);
  assert.equal(expired.ok, false);
});

test('upload, public GET, verify API, and revoke', async () => {
  const { token, accountId } = await bearerFor('pro');
  const png = Buffer.from('fake-png').toString('base64');
  const up = await request(app)
    .post('/v1/sync/blob/cap_x/upload')
    .set('Authorization', `Bearer ${token}`)
    .send({ base64: png });
  assert.equal(up.status, 200);
  assert.ok(up.body.url);

  const signed = buildCaptureUrl(accountId, 'cap_x');
  const url = new URL(signed);
  const pub = await request(app).get(`${url.pathname}${url.search}`);
  assert.equal(pub.status, 200);

  const verify = await request(app)
    .post('/v1/sync/signed-url/verify')
    .send({
      accountId,
      captureId: 'cap_x',
      exp: Number(url.searchParams.get('exp')),
      sig: url.searchParams.get('sig'),
    });
  assert.equal(verify.body.valid, true);

  const del = await request(app)
    .delete('/v1/sync/blob/cap_x')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);

  const pubAfter = await request(app).get(`${url.pathname}${url.search}`);
  assert.equal(pubAfter.status, 404);

  const verifyAfter = await request(app)
    .post('/v1/sync/signed-url/verify')
    .send({
      accountId,
      captureId: 'cap_x',
      exp: Number(url.searchParams.get('exp')),
      sig: url.searchParams.get('sig'),
    });
  assert.equal(verifyAfter.body.valid, false);
});

test('tier gate blocks blob upload for free accounts', async () => {
  const { token } = await bearerFor('free');
  const res = await request(app)
    .put('/v1/sync/blob/cap_y')
    .set('Authorization', `Bearer ${token}`)
    .send({ base64: Buffer.from('x').toString('base64') });
  assert.equal(res.status, 402);
  assert.equal(res.body.error, 'sync_not_entitled');
});

test('public GET rejects missing exp, legacy sig-only URLs, and legacy HMAC format', async () => {
  const { token, accountId } = await bearerFor('pro');
  await request(app)
    .post('/v1/sync/blob/cap_legacy/upload')
    .set('Authorization', `Bearer ${token}`)
  .send({ base64: Buffer.from('png').toString('base64') });

  const legacySig = createHmac('sha256', process.env.AUTH_SECRET!)
    .update(`${accountId}:cap_legacy`)
    .digest('hex');
  const path = `/v1/public/captures/${encodeURIComponent(accountId)}/${encodeURIComponent('cap_legacy')}.png`;

  const noQuery = await request(app).get(path);
  assert.equal(noQuery.status, 403);

  const sigOnly = await request(app).get(`${path}?sig=${encodeURIComponent(legacySig)}`);
  assert.equal(sigOnly.status, 403);

  const legacyPair = await request(app).get(`${path}?sig=${encodeURIComponent(legacySig)}&exp=`);
  assert.equal(legacyPair.status, 403);

  const wrongExpSig = await request(app).get(
    `${path}?exp=${Date.now() + 60_000}&sig=${encodeURIComponent(legacySig)}`,
  );
  assert.equal(wrongExpSig.status, 403);
});

test('mocked storage round-trip via sync store', async () => {
  await sync.putBlob('acc_m', 'blob_1', Buffer.from('bytes').toString('base64'));
  assert.equal(await sync.blobAvailable('acc_m', 'blob_1'), true);
  assert.ok(await sync.getBlob('acc_m', 'blob_1'));
  await sync.revokeBlob('acc_m', 'blob_1');
  assert.equal(await sync.blobAvailable('acc_m', 'blob_1'), false);
});
