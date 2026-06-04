import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

// Isolate DB before importing modules that read config.
const dir = mkdtempSync(join(tmpdir(), 'snapflow-oauth-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
const { initDb } = await import('../src/store');
await initDb();
const { registerProvider, getProvider, buildAuthorizeUrl, exchangeCode, fetchEmail } = await import('../src/oauth/providers');
const { oauthState } = await import('../src/oauth/state');

// Mock OAuth provider: token + userinfo endpoints.
let tokenHits = 0;
const mock = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url?.startsWith('/token')) { tokenHits++; res.end(JSON.stringify({ access_token: 'mock-access-token' })); }
  else if (req.url?.startsWith('/userinfo')) {
    assert.equal(req.headers.authorization, 'Bearer mock-access-token');
    res.end(JSON.stringify({ email: 'oauth-user@example.com' }));
  } else { res.statusCode = 404; res.end('{}'); }
});
await new Promise<void>(r => mock.listen(0, () => r()));
mock.unref();
const port = (mock.address() as { port: number }).port;
after(() => mock.close());

registerProvider({
  id: 'mock', authorizeUrl: 'https://mock.test/authorize',
  tokenUrl: `http://localhost:${port}/token`, userInfoUrl: `http://localhost:${port}/userinfo`,
  scope: 'email', clientId: 'cid-123', clientSecret: 'secret-xyz',
  extractEmail: (i) => (i.email as string) ?? null,
});

test('buildAuthorizeUrl includes client_id, redirect_uri, scope and state', () => {
  const url = buildAuthorizeUrl(getProvider('mock')!, 'state-abc', 'http://localhost:3001/cb');
  assert.match(url, /^https:\/\/mock\.test\/authorize\?/);
  const q = new URLSearchParams(url.split('?')[1]);
  assert.equal(q.get('client_id'), 'cid-123');
  assert.equal(q.get('redirect_uri'), 'http://localhost:3001/cb');
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('state'), 'state-abc');
  assert.equal(q.get('scope'), 'email');
});

test('state is single-use and provider-bound', async () => {
  const s = await oauthState.create('mock');
  assert.equal(await oauthState.consume(s), 'mock');     // valid once
  assert.equal(await oauthState.consume(s), null);       // already consumed
  assert.equal(await oauthState.consume('never-made'), null);
});

test('exchangeCode posts to the token endpoint and returns the access token', async () => {
  const before = tokenHits;
  const token = await exchangeCode(getProvider('mock')!, 'auth-code-1', 'http://localhost:3001/cb');
  assert.equal(token, 'mock-access-token');
  assert.equal(tokenHits, before + 1);
});

test('fetchEmail reads the email from userinfo using the bearer token', async () => {
  const email = await fetchEmail(getProvider('mock')!, 'mock-access-token');
  assert.equal(email, 'oauth-user@example.com');
});

test('unknown provider resolves to undefined', () => {
  assert.equal(getProvider('myspace'), undefined);
});
