import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-oauth-redir-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.SLACK_CLIENT_ID = 'slack-client';
process.env.SLACK_CLIENT_SECRET = 'slack-secret';
process.env.APP_REDIRECT_URL = 'snapflow://oauth/callback';
process.env.OAUTH_REDIRECT_BASE = 'http://localhost:3001';

const { initDb } = await import('../src/store');
await initDb();
const { accounts } = await import('../src/accounts/store');
const { issueToken } = await import('../src/auth/tokens');
const { createApp } = await import('../src/index');

const { default: supertest } = await import('supertest');
const app = createApp();
const request = supertest(app) as any;

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test('failed destination OAuth redirects to snapflow error deep link', async () => {
  const account = await accounts.getOrCreate('redirect-err@example.com', 'pro');
  const token = issueToken(account.id);

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const start = await request.post('/v1/integrations/slack/oauth-url').set('authorization', `Bearer ${token}`).send({});
  const state = new URL(start.body.url).searchParams.get('state');
  assert.ok(state);

  const callback = await request.get(`/auth/oauth/slack/callback?code=bad&state=${state}`);
  assert.equal(callback.status, 302);
  const location = callback.headers.location as string;
  assert.match(location, /^snapflow:\/\/oauth\/callback\?/);
  assert.match(location, /oauth=error/);
  assert.match(location, /destination=slack/);
  assert.match(location, /error=/);
});
