import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-oauth-sec-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.SLACK_CLIENT_ID = 'slack-client';
process.env.SLACK_CLIENT_SECRET = 'slack-secret';
process.env.JIRA_CLIENT_ID = 'jira-client';
process.env.JIRA_CLIENT_SECRET = 'jira-secret';
process.env.GOOGLE_CLIENT_ID = 'google-client';
process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
process.env.OAUTH_REDIRECT_BASE = 'http://localhost:3001';

const { initDb } = await import('../src/store');
await initDb();
const { accounts } = await import('../src/accounts/store');
const { issueBearerToken } = await import('../src/auth/sessions');
const { createApp } = await import('../src/index');
const { vault } = await import('../src/vault/store');
const { oauthState } = await import('../src/oauth/state');

const { default: supertest } = await import('supertest');
const app = createApp();
const request = supertest(app) as any;

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test('authorize URLs match Nov 2025 provider registrations (scopes and redirect)', async () => {
  const account = await accounts.getOrCreate('scopes@example.com', 'pro');
  const token = await issueBearerToken(account.id);

  const slack = await request.post('/v1/integrations/slack/oauth-url').set('authorization', `Bearer ${token}`).send({});
  const slackUrl = new URL(slack.body.url);
  assert.equal(slackUrl.searchParams.get('scope'), 'files:write,channels:read,groups:read');
  assert.equal(slackUrl.searchParams.get('redirect_uri'), 'http://localhost:3001/auth/oauth/slack/callback');

  const jira = await request.post('/v1/integrations/jira/oauth-url').set('authorization', `Bearer ${token}`).send({});
  const jiraUrl = new URL(jira.body.url);
  assert.match(jiraUrl.searchParams.get('scope') ?? '', /offline_access/);
  assert.match(jiraUrl.searchParams.get('scope') ?? '', /write:jira-work/);
  assert.equal(jiraUrl.searchParams.get('redirect_uri'), 'http://localhost:3001/auth/oauth/jira/callback');

  const gmail = await request.post('/v1/integrations/gmail/oauth-url').set('authorization', `Bearer ${token}`).send({});
  const gmailUrl = new URL(gmail.body.url);
  assert.equal(gmailUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.send');
  assert.equal(gmailUrl.searchParams.get('access_type'), 'offline');
  assert.equal(gmailUrl.searchParams.get('redirect_uri'), 'http://localhost:3001/auth/oauth/google/callback');
});

test('OAuth callback rejects missing code and state', async () => {
  const missingCode = await request.get('/auth/oauth/slack/callback?state=abc');
  assert.equal(missingCode.status, 400);
  assert.equal(missingCode.body.error, 'bad_request');
});

test('OAuth callback rejects reused state (single-use CSRF)', async () => {
  const account = await accounts.getOrCreate('reuse@example.com', 'pro');
  mockFetch((url) => {
    if (url === 'https://slack.com/api/oauth.v2.access') {
      return json({ ok: true, access_token: 't', team: { name: 'HQ' } });
    }
    if (url === 'https://slack.com/api/auth.test') {
      return json({ ok: true, team: 'HQ', user: 'bot' });
    }
    throw new Error(url);
  });
  const state = await oauthState.createContext('slack', { flow: 'destination', destination: 'slack', accountId: account.id });
  const first = await request.get(`/auth/oauth/slack/callback?code=x&state=${state}`);
  assert.equal(first.status, 200);
  const replay = await request.get(`/auth/oauth/slack/callback?code=x&state=${state}`);
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error, 'invalid_state');
});

test('OAuth callback rejects provider mismatch for destination flow', async () => {
  const state = await oauthState.createContext('notion', { flow: 'destination', destination: 'notion', accountId: 'acct-2' });
  const res = await request.get(`/auth/oauth/slack/callback?code=abc&state=${state}`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_state');
});

test('jira refresh stores rotated refresh_token when Atlassian returns one', async () => {
  const account = await accounts.getOrCreate('jira-rotate@example.com', 'pro');
  const token = await issueBearerToken(account.id);
  await vault.put(account.id, 'jira', JSON.stringify({
    accessToken: 'expired',
    refreshToken: 'jira-refresh-old',
    expiresAt: Date.now() - 60_000,
    profile: { label: 'Jira', meta: { cloudId: 'cloud-1' } },
  }));

  mockFetch((url) => {
    if (url === 'https://auth.atlassian.com/oauth/token') {
      return json({
        access_token: 'jira-new-access',
        refresh_token: 'jira-refresh-new',
        expires_in: 3600,
      });
    }
    if (url.includes('/oauth/token/accessible-resources')) {
      return json([{ id: 'cloud-1', name: 'Acme Jira', url: 'https://acme.atlassian.net' }]);
    }
    throw new Error(`Unexpected fetch ${url}`);
  });

  const { withDestinationAccessToken } = await import('../src/oauth/destination-tokens');
  await withDestinationAccessToken(account.id, 'jira', async () => ({ ok: true }));

  const stored = JSON.parse((await vault.reveal(account.id, 'jira')) ?? '{}');
  assert.equal(stored.accessToken, 'jira-new-access');
  assert.equal(stored.refreshToken, 'jira-refresh-new');
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: URL | string | { url: string }, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
