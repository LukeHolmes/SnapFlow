import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-billing-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.DEV_LOGIN = 'true';
process.env.BILLING_WEBHOOK_SECRET = 'whsec_' + 'a'.repeat(40);

const { initDb } = await import('../src/store');
const { accounts } = await import('../src/accounts/store');
const { createApp } = await import('../src/index');
const { signBillingWebhookPayload } = await import('../src/billing/webhook-verify');

await initDb();
const app = createApp();
const { default: supertest } = await import('supertest');

test('billing webhook rejects missing signature when secret configured', async () => {
  const acct = await accounts.getOrCreate('billing@test.com', 'free');
  const body = { accountId: acct.id, tier: 'pro' };
  const r = await supertest(app).post('/v1/billing/webhook').send(body);
  assert.equal(r.status, 401);
});

test('billing webhook accepts valid HMAC signature', async () => {
  const acct = await accounts.getOrCreate('billing2@test.com', 'free');
  const body = { accountId: acct.id, tier: 'pro' };
  const raw = JSON.stringify(body);
  const sig = signBillingWebhookPayload(raw, process.env.BILLING_WEBHOOK_SECRET!);
  const r = await supertest(app)
    .post('/v1/billing/webhook')
    .set('snapflow-signature', sig)
    .send(body);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const updated = await accounts.get(acct.id);
  assert.equal(updated?.tier, 'pro');
});
