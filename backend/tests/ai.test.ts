import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = '';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'snapflow-ai-')), 'test.db');
const { initDb } = await import('../src/store');
const { issueToken } = await import('../src/auth/tokens');
const { accounts } = await import('../src/accounts/store');
const { createApp } = await import('../src/index');
await initDb();
const app = createApp();

const mkToken = async (tier: string) => {
  const a = await accounts.getOrCreate(`${tier}-ai@test.com`, tier as any);
  return issueToken(a.id);
};

const fakePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==').toString('base64');

test('POST /v1/ai/diff → 402 for free tier', async () => {
  const { default: supertest } = await import('supertest');
  const tok = await mkToken('free');
  const r = await (supertest(app) as any).post('/v1/ai/diff')
    .set('authorization', `Bearer ${tok}`)
    .send({ beforeBase64: fakePng, afterBase64: fakePng });
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'ai_not_entitled');
});

test('POST /v1/ai/diff → 200 with stub summary for pro tier (no API key)', async () => {
  const { default: supertest } = await import('supertest');
  const tok = await mkToken('pro');
  const r = await (supertest(app) as any).post('/v1/ai/diff')
    .set('authorization', `Bearer ${tok}`)
    .send({ beforeBase64: fakePng, afterBase64: fakePng });
  assert.equal(r.status, 200);
  assert.ok(r.body.summary, 'summary should be non-empty');
  assert.equal(typeof r.body.summary, 'string');
});

test('POST /v1/ai/diff → 400 when images missing', async () => {
  const { default: supertest } = await import('supertest');
  const tok = await mkToken('pro');
  const r = await (supertest(app) as any).post('/v1/ai/diff')
    .set('authorization', `Bearer ${tok}`)
    .send({});
  assert.equal(r.status, 400);
});

test('POST /v1/ai/tag → still works (no regression)', async () => {
  const { default: supertest } = await import('supertest');
  const tok = await mkToken('pro');
  const r = await (supertest(app) as any).post('/v1/ai/tag')
    .set('authorization', `Bearer ${tok}`)
    .send({ imageBase64: fakePng });
  assert.equal(r.status, 200);
  assert.ok(r.body.tag);
});
