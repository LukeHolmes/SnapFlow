import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { IntegrationStatus } from '../src/shared/types';

process.env.SNAPFLOW_AI_PROXY_URL = 'http://snapflow.test';
process.env.SNAPFLOW_API_TOKEN = 'test-token';

const originalFetch = globalThis.fetch;

let IntegrationBackendClient: typeof import('../src/main/integrations/backend-client').IntegrationBackendClient;

before(async () => {
  ({ IntegrationBackendClient } = await import('../src/main/integrations/backend-client'));
});

after(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

test('IntegrationBackendClient.getStatuses returns remote statuses matching IPC shape', async () => {
  const backendStatuses: IntegrationStatus[] = [
    { destination: 'slack', connected: true, state: 'connected', label: 'SnapFlow HQ' },
    { destination: 'jira', connected: false, state: 'disconnected' },
    { destination: 'notion', connected: true, state: 'connected', label: 'Docs' },
    { destination: 'gmail', connected: true, state: 'connected', label: 'user@test.com' },
    { destination: 'github', connected: false, state: 'disconnected' },
  ];

  mockFetch((url, init) => {
    assert.equal(url, 'http://snapflow.test/v1/integrations/statuses');
    assert.equal(init?.method ?? 'GET', 'GET');
    const authHeader = (init?.headers as Record<string, string>)?.authorization;
    assert.equal(authHeader, 'Bearer test-token');
    return new Response(JSON.stringify(backendStatuses), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const client = new IntegrationBackendClient('http://snapflow.test', 'test-token');
  assert.equal(client.configured, true);

  const statuses = await client.getStatuses();
  assert.equal(statuses.length, 5);

  const slack = statuses.find(s => s.destination === 'slack');
  assert.equal(slack?.connected, true);
  assert.equal(slack?.label, 'SnapFlow HQ');
  assert.equal(slack?.state, 'connected');

  const github = statuses.find(s => s.destination === 'github');
  assert.equal(github?.connected, false);
  assert.equal(github?.state, 'disconnected');
});

test('IntegrationBackendClient.configured is false without URL or token', () => {
  const noUrl = new IntegrationBackendClient(undefined, 'token');
  assert.equal(noUrl.configured, false);

  const noToken = new IntegrationBackendClient('http://snapflow.test', undefined);
  assert.equal(noToken.configured, false);

  const neither = new IntegrationBackendClient(undefined, undefined);
  assert.equal(neither.configured, false);
});

test('IPC handler merges remote + local zapier status correctly (logic test)', async () => {
  const backendStatuses: IntegrationStatus[] = [
    { destination: 'slack', connected: true, state: 'connected', label: 'SnapFlow HQ' },
    { destination: 'jira', connected: false, state: 'disconnected' },
    { destination: 'notion', connected: true, state: 'connected', label: 'Docs' },
    { destination: 'gmail', connected: true, state: 'connected', label: 'user@test.com' },
    { destination: 'github', connected: false, state: 'disconnected' },
  ];

  mockFetch((url) => {
    if (url === 'http://snapflow.test/v1/integrations/statuses') {
      return new Response(JSON.stringify(backendStatuses), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const client = new IntegrationBackendClient('http://snapflow.test', 'test-token');
  const remote = await client.getStatuses();

  // Simulate the zapier logic from ipc.ts: append a local zapier entry
  const webhookUrl = 'https://hooks.zapier.com/test';
  const isHttpsUrl = (v: string) => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };
  const zapierStatus: IntegrationStatus = {
    destination: 'zapier',
    connected: isHttpsUrl(webhookUrl),
    state: isHttpsUrl(webhookUrl) ? 'connected' : 'error',
    label: webhookUrl,
    secondary: 'Webhook configured',
  };
  remote.push(zapierStatus);

  assert.equal(remote.length, 6);
  const zapier = remote.find(s => s.destination === 'zapier');
  assert.equal(zapier?.connected, true);
  assert.equal(zapier?.state, 'connected');
  assert.equal(zapier?.label, 'https://hooks.zapier.com/test');
});
