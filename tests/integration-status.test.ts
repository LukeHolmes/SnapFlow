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
  assert.equal(statuses[0].destination, 'slack');
});

test('IntegrationBackendClient maps not_connected errors to actionable copy', async () => {
  mockFetch(() => new Response(JSON.stringify({
    error: 'not_connected',
    message: 'Slack is not connected. Reconnect Slack to continue.',
  }), { status: 409, headers: { 'content-type': 'application/json' } }));

  const client = new IntegrationBackendClient('http://snapflow.test', 'test-token');
  await assert.rejects(
    () => client.getSlackChannels(),
    /Connect this destination from Output Presets/,
  );
});

test('IntegrationBackendClient.disconnect calls DELETE integration route', async () => {
  let method = '';
  mockFetch((url, init) => {
    assert.equal(url, 'http://snapflow.test/v1/integrations/slack');
    method = init?.method ?? 'GET';
    return new Response(JSON.stringify({ ok: true, destination: 'slack' }), { status: 200 });
  });

  const client = new IntegrationBackendClient('http://snapflow.test', 'test-token');
  await client.disconnect('slack');
  assert.equal(method, 'DELETE');
});
