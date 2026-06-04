import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = '';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'snapflow-dest-oauth-')), 'test.db');
process.env.SLACK_CLIENT_ID = 'slack-client';
process.env.SLACK_CLIENT_SECRET = 'slack-secret';
process.env.NOTION_CLIENT_ID = 'notion-client';
process.env.NOTION_CLIENT_SECRET = 'notion-secret';
process.env.GOOGLE_CLIENT_ID = 'google-client';
process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
process.env.GITHUB_CLIENT_ID = 'github-client';
process.env.GITHUB_CLIENT_SECRET = 'github-secret';
process.env.APP_REDIRECT_URL = '';

const { initDb } = await import('../src/store');
await initDb();
const { accounts } = await import('../src/accounts/store');
const { issueToken } = await import('../src/auth/tokens');
const { createApp } = await import('../src/index');
const { vault } = await import('../src/vault/store');
const { readDestinationToken } = await import('../src/oauth/destination-tokens');

const { default: supertest } = await import('supertest');
const app = createApp();
const request = supertest(app) as any;

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

type Case = {
  destination: 'slack' | 'notion' | 'gmail' | 'github';
  oauthRoute: string;
  callbackRoute: string;
  resourceRoute: string;
  authorizeCheck: (url: string) => void;
  tokenUrl: string;
  exchangeResponse: Record<string, unknown>;
  describeUrl: string;
  describeResponse: Record<string, unknown>;
  refreshResponse: Record<string, unknown>;
  resourceUrlIncludes: string;
  resourceResponse: Record<string, unknown> | Array<Record<string, unknown>>;
  expectedLabel: string;
};

const cases: Case[] = [
  {
    destination: 'slack',
    oauthRoute: '/v1/integrations/slack/oauth-url',
    callbackRoute: '/auth/oauth/slack/callback',
    resourceRoute: '/v1/integrations/slack/channels',
    authorizeCheck: url => assert.match(url, /slack\.com\/oauth\/v2\/authorize/),
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    exchangeResponse: { ok: true, access_token: 'slack-token', refresh_token: 'slack-refresh', expires_in: 3600, team: { name: 'SnapFlow HQ' } },
    describeUrl: 'https://slack.com/api/auth.test',
    describeResponse: { ok: true, team: 'SnapFlow HQ', user: 'snapflow-bot' },
    refreshResponse: { ok: true, access_token: 'slack-refreshed', refresh_token: 'slack-refresh-2', expires_in: 3600 },
    resourceUrlIncludes: '/conversations.list',
    resourceResponse: { channels: [{ id: 'C1', name: 'qa-bugs' }] },
    expectedLabel: 'SnapFlow HQ',
  },
  {
    destination: 'notion',
    oauthRoute: '/v1/integrations/notion/oauth-url',
    callbackRoute: '/auth/oauth/notion/callback',
    resourceRoute: '/v1/integrations/notion/pages?q=release',
    authorizeCheck: url => assert.match(url, /api\.notion\.com\/v1\/oauth\/authorize/),
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    exchangeResponse: { access_token: 'notion-token', refresh_token: 'notion-refresh', expires_in: 3600 },
    describeUrl: 'https://api.notion.com/v1/users/me',
    describeResponse: { name: 'Release Docs' },
    refreshResponse: { access_token: 'notion-refreshed', refresh_token: 'notion-refresh-2', expires_in: 3600 },
    resourceUrlIncludes: '/v1/search',
    resourceResponse: { results: [{ id: 'page_1', properties: { title: { type: 'title', title: [{ plain_text: 'Release Notes' }] } } }] },
    expectedLabel: 'Release Docs',
  },
  {
    destination: 'gmail',
    oauthRoute: '/v1/integrations/gmail/oauth-url',
    callbackRoute: '/auth/oauth/google/callback',
    resourceRoute: '/v1/integrations/gmail/profile',
    authorizeCheck: url => assert.match(url, /accounts\.google\.com\/o\/oauth2\/v2\/auth/),
    tokenUrl: 'https://oauth2.googleapis.com/token',
    exchangeResponse: { access_token: 'gmail-token', refresh_token: 'gmail-refresh', expires_in: 3600 },
    describeUrl: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    describeResponse: { emailAddress: 'luke@snapflow.app' },
    refreshResponse: { access_token: 'gmail-refreshed', expires_in: 3600 },
    resourceUrlIncludes: '/gmail/v1/users/me/profile',
    resourceResponse: { emailAddress: 'luke@snapflow.app' },
    expectedLabel: 'luke@snapflow.app',
  },
  {
    destination: 'github',
    oauthRoute: '/v1/integrations/github/oauth-url',
    callbackRoute: '/auth/oauth/github/callback',
    resourceRoute: '/v1/integrations/github/repos?q=snapflow',
    authorizeCheck: url => assert.match(url, /github\.com\/login\/oauth\/authorize/),
    tokenUrl: 'https://github.com/login/oauth/access_token',
    exchangeResponse: { access_token: 'github-token', refresh_token: 'github-refresh', expires_in: 3600 },
    describeUrl: 'https://api.github.com/user',
    describeResponse: { login: 'acme', name: 'Acme Corp' },
    refreshResponse: { access_token: 'github-refreshed', expires_in: 3600 },
    resourceUrlIncludes: '/user/repos',
    resourceResponse: [{ full_name: 'acme/snapflow', private: false }],
    expectedLabel: 'acme',
  },
];

for (const c of cases) {
  test(`${c.destination} OAuth flow stores the exchanged token in the vault`, async () => {
    const account = await accounts.getOrCreate(`${c.destination}@example.com`, 'pro');
    const token = issueToken(account.id);

    mockFetch((url) => {
      if (url === c.tokenUrl) return json(c.exchangeResponse);
      if (url === c.describeUrl) return json(c.describeResponse);
      throw new Error(`Unexpected fetch ${url}`);
    });

    const start = await request.post(c.oauthRoute).set('authorization', `Bearer ${token}`).send(c.destination === 'github' ? { scope: 'public_repo' } : {});
    assert.equal(start.status, 200);
    c.authorizeCheck(start.body.url);
    const state = new URL(start.body.url).searchParams.get('state');
    assert.ok(state);

    const callback = await request.get(`${c.callbackRoute}?code=auth-code-1&state=${state}`);
    assert.equal(callback.status, 200);
    assert.equal(callback.body.ok, true);

    const stored = JSON.parse((await vault.reveal(account.id, c.destination)) ?? '{}');
    assert.equal(stored.accessToken, String(c.exchangeResponse.access_token));
    assert.equal(stored.profile.label, c.expectedLabel);
  });

  test(`${c.destination} resource routes refresh expired tokens before use`, async () => {
    const account = await accounts.getOrCreate(`${c.destination}-refresh@example.com`, 'pro');
    const token = issueToken(account.id);
    await vault.put(account.id, c.destination, JSON.stringify({
      accessToken: 'expired-token',
      refreshToken: `${c.destination}-refresh-token`,
      expiresAt: Date.now() - 60_000,
      profile: { label: 'Old label' },
    }));

    mockFetch((url) => {
      if (url === c.tokenUrl) return json(c.refreshResponse);
      if (url === c.describeUrl) return json(c.describeResponse);
      if (url.includes(c.resourceUrlIncludes)) return json(c.resourceResponse);
      throw new Error(`Unexpected fetch ${url}`);
    });

    const resource = await request.get(c.resourceRoute).set('authorization', `Bearer ${token}`);
    assert.equal(resource.status, 200);

    const stored = JSON.parse((await vault.reveal(account.id, c.destination)) ?? '{}');
    assert.equal(stored.accessToken, String(c.refreshResponse.access_token));
    assert.equal(stored.profile.label, c.expectedLabel);
  });
}

test('legacy raw vault tokens still read as access tokens', async () => {
  const account = await accounts.getOrCreate('legacy-token@example.com', 'pro');
  await vault.put(account.id, 'slack', 'xoxb-legacy-token');
  const stored = await readDestinationToken(account.id, 'slack');
  assert.equal(stored?.accessToken, 'xoxb-legacy-token');
});

test('missing destination token surfaces not_connected instead of 500', async () => {
  const account = await accounts.getOrCreate('missing-destination@example.com', 'pro');
  const token = issueToken(account.id);
  const response = await request.get('/v1/integrations/slack/channels').set('authorization', `Bearer ${token}`);
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'not_connected');
});

test('expired destination token without refresh surfaces reconnect_required', async () => {
  const account = await accounts.getOrCreate('expired-destination@example.com', 'pro');
  const token = issueToken(account.id);
  await vault.put(account.id, 'gmail', JSON.stringify({
    accessToken: 'expired-gmail-token',
    expiresAt: Date.now() - 60_000,
  }));
  const response = await request.get('/v1/integrations/gmail/profile').set('authorization', `Bearer ${token}`);
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'reconnect_required');
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
