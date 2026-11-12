import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { EntitlementsCache as EntitlementsCacheType } from '../src/main/entitlements/cache';
import { entitlementsFor } from '../src/main/entitlements';

let EntitlementsCache: typeof EntitlementsCacheType;
let server: Server;
let port = 0;
let entitlementsHits = 0;

before(async () => {
  process.env.SNAPFLOW_TEST_HARNESS = '1';
  ({ EntitlementsCache } = await import('../src/main/entitlements/cache'));

  server = createServer((req, res) => {
    if (req.url === '/v1/entitlements') {
      entitlementsHits += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ...entitlementsFor('pro'), accountTier: 'pro' }));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>(r => server.listen(0, () => r()));
  port = (server.address() as { port: number }).port;
});

after(() => server.close());

test('offline without token falls back to free', () => {
  delete process.env.SNAPFLOW_API_TOKEN;
  delete process.env.SNAPFLOW_AI_PROXY_URL;
  const cache = new EntitlementsCache();
  assert.equal(cache.get().tier, 'free');
});

test('refresh caches entitlements from backend', async () => {
  entitlementsHits = 0;
  process.env.SNAPFLOW_AI_PROXY_URL = `http://127.0.0.1:${port}`;
  process.env.SNAPFLOW_API_TOKEN = 'test-token';
  delete process.env.SNAPFLOW_TIER;

  const cache = new EntitlementsCache(60_000);
  const ent = await cache.refresh();
  assert.equal(ent.tier, 'pro');
  assert.equal(ent.aiEnabled, true);
  assert.equal(entitlementsHits, 1);
  assert.equal(cache.get().tier, 'pro');
});

test('stale fetch failure keeps recent cache within TTL', async () => {
  process.env.SNAPFLOW_AI_PROXY_URL = 'http://127.0.0.1:1';
  process.env.SNAPFLOW_API_TOKEN = 'test-token';
  const cache = new EntitlementsCache(60_000);
  cache.setCached(entitlementsFor('team'));
  const ent = await cache.refresh();
  assert.equal(ent.tier, 'team');
});
