import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import request from 'supertest';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

process.env.DATABASE_URL = '';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'snap-ev-')), 'b.db');
process.env.DATA_DIR = process.env.DB_PATH.replace(/[^/]+$/, '');
process.env.DEV_LOGIN = 'true';
process.env.EVIDENCE_TEST_MOCK = '1';

const { initDb } = await import('../src/store');
await initDb();
const { createApp } = await import('../src/index');
const { evidenceTestDoubles } = await import('../src/evidence/test-doubles');

function clearDoubles(): void {
  evidenceTestDoubles.loadIdentity = undefined;
  evidenceTestDoubles.createEvidenceItem = undefined;
  evidenceTestDoubles.ingestRedactedVersion = undefined;
  evidenceTestDoubles.signPack = undefined;
}

const sampleIdentity = (accountId: string) => ({
  snapflowAccountId: accountId,
  organisationId: '11111111-1111-4111-8111-111111111111',
  supabaseUserId: '22222222-2222-4222-8222-222222222222',
  role: 'tester' as const,
});

describe('evidence BFF routes', () => {
  let token: string;
  let accountId: string;

  before(async () => {
    const login = await request(createApp())
      .post('/auth/token')
      .send({ email: 'evidence@test.example', tier: 'pro' });
    assert.equal(login.status, 200);
    accountId = login.body.account.id as string;
    token = login.body.accessToken as string;
  });

  afterEach(() => {
    clearDoubles();
  });

  after(() => {
    clearDoubles();
  });

  it('returns 402 when tier is free', async () => {
    const freeLogin = await request(createApp()).post('/auth/token').send({ email: 'free-ev@test', tier: 'free' });
    const res = await request(createApp())
      .post('/v1/evidence/items')
      .set('Authorization', `Bearer ${freeLogin.body.accessToken}`)
      .send({ organisationId: 'o', localCaptureId: 'c' });
    assert.equal(res.status, 402);
    assert.equal(res.body.error, 'evidence_sync_not_entitled');
  });

  it('returns 403 without evidence_bff_identities mapping', async () => {
    evidenceTestDoubles.loadIdentity = async () => null;
    const res = await request(createApp())
      .post('/v1/evidence/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ organisationId: 'o', localCaptureId: 'c', testStepId: 's' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'evidence_identity_missing');
  });

  it('creates item when identity and service succeed', async () => {
    evidenceTestDoubles.loadIdentity = async () => sampleIdentity(accountId);
    evidenceTestDoubles.createEvidenceItem = async () => ({ id: '33333333-3333-4333-8333-333333333333' });
    const res = await request(createApp())
      .post('/v1/evidence/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        organisationId: '11111111-1111-4111-8111-111111111111',
        localCaptureId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        testStepId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, '33333333-3333-4333-8333-333333333333');
  });

  it('rejects version upload when unredacted flag set', async () => {
    evidenceTestDoubles.loadIdentity = async () => sampleIdentity(accountId);
    evidenceTestDoubles.ingestRedactedVersion = async () => {
      throw Object.assign(new Error('only redacted'), { status: 400, code: 'unredacted_rejected' });
    };
    const res = await request(createApp())
      .post('/v1/evidence/items/33333333-3333-4333-8333-333333333333/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ redactedPngBase64: Buffer.from('png').toString('base64'), includesUnredactedOriginal: true });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'unredacted_rejected');
  });

  it('requires reauth for signatures', async () => {
    evidenceTestDoubles.loadIdentity = async () => ({ ...sampleIdentity(accountId), role: 'reviewer' });
    evidenceTestDoubles.signPack = async () => {
      throw Object.assign(new Error('reauth'), { status: 403, code: 'reauth_required' });
    };
    const res = await request(createApp())
      .post('/v1/evidence/packs/pack-1/signatures')
      .set('Authorization', `Bearer ${token}`)
      .send({ meaning: 'reviewer', reauthConfirmed: false });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'reauth_required');
  });
});
