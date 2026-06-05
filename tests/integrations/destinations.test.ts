import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Capture } from '../../src/shared/types';

process.env.SNAPFLOW_AI_PROXY_URL = 'http://snapflow.test';
process.env.SNAPFLOW_API_TOKEN = 'desktop-token';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-integrations-'));
const pngPath = join(dir, 'capture.png');
writeFileSync(pngPath, Buffer.from('png-bytes'));

let configureIntegrationRuntime: typeof import('../../src/main/integrations/runtime').configureIntegrationRuntime;
let slackDestination: typeof import('../../src/main/integrations/slack').slackDestination;
let jiraDestination: typeof import('../../src/main/integrations/jira').jiraDestination;
let notionDestination: typeof import('../../src/main/integrations/notion').notionDestination;
let gmailDestination: typeof import('../../src/main/integrations/gmail').gmailDestination;
let githubDestination: typeof import('../../src/main/integrations/github').githubDestination;
let zapierDestination: typeof import('../../src/main/integrations/zapier').zapierDestination;
let signWebhookPayload: typeof import('../../src/main/integrations/zapier').signWebhookPayload;
let verifyWebhookSignature: typeof import('../../src/main/integrations/zapier').verifyWebhookSignature;

const originalFetch = globalThis.fetch;

before(async () => {
  ({ configureIntegrationRuntime } = await import('../../src/main/integrations/runtime'));
  ({ slackDestination } = await import('../../src/main/integrations/slack'));
  ({ jiraDestination } = await import('../../src/main/integrations/jira'));
  ({ notionDestination } = await import('../../src/main/integrations/notion'));
  ({ gmailDestination } = await import('../../src/main/integrations/gmail'));
  ({ githubDestination } = await import('../../src/main/integrations/github'));
  ({ zapierDestination, signWebhookPayload, verifyWebhookSignature } = await import('../../src/main/integrations/zapier'));
});

after(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

function capture(id = 'cap_1'): Capture {
  return {
    id,
    workspaceId: 'ws_local',
    filename: 'Login bug',
    imagePath: pngPath,
    tag: 'ui',
    ocrText: 'Submit button missing',
    hasPii: false,
    createdAt: Date.now(),
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

test('slack deliver posts the preset config to the backend client', async () => {
  let requestBody = '';
  mockFetch((url, init) => {
    assert.equal(url, 'http://snapflow.test/v1/deliver');
    requestBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ ok: true, detail: 'Delivered to Slack', url: 'https://slack.example/file/F123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const result = await slackDestination.deliver(capture(), { channel_id: 'C123', channel_name: '#qa-bugs', workspace_name: 'SnapFlow HQ' });
  const payload = JSON.parse(requestBody);
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://slack.example/file/F123');
  assert.equal(payload.destination, 'slack');
  assert.equal(payload.config.channel_id, 'C123');
});

test('jira deliver queues until the capture finishes syncing', async () => {
  configureIntegrationRuntime({
    sync: {
      run: async () => ({ pushed: 0, pulled: 0 }),
      waitForBlobUpload: async () => false,
    } as any,
  });
  let captureUrlChecks = 0;
  mockFetch((url) => {
    if (url === 'http://snapflow.test/v1/integrations/capture-url/cap_1') {
      captureUrlChecks += 1;
      return new Response(JSON.stringify({ message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });

  const result = await jiraDestination.deliver(capture(), { project_key: 'ENG', issue_summary: 'Login form broken' });
  assert.equal(captureUrlChecks, 1);
  assert.equal(result.queued, true);
  assert.match(result.detail, /queued/i);
});

test('notion deliver queues while cloud sync is still pending', async () => {
  configureIntegrationRuntime({
    sync: {
      run: async () => ({ pushed: 0, pulled: 0 }),
      waitForBlobUpload: async () => false,
    } as any,
  });
  let captureUrlChecks = 0;
  mockFetch((url) => {
    if (url === 'http://snapflow.test/v1/integrations/capture-url/cap_1') {
      captureUrlChecks += 1;
      return new Response(JSON.stringify({ message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });

  const result = await notionDestination.deliver(capture(), { page_id: 'page_123', page_title: 'Release Notes' });
  assert.equal(captureUrlChecks, 1);
  assert.equal(result.queued, true);
  assert.match(result.detail, /queued/i);
});

test('gmail deliver validates recipient addresses before sending', async () => {
  const result = await gmailDestination.deliver(capture(), { recipients: ['not-an-email'] });
  assert.equal(result.ok, false);
  assert.match(result.detail, /valid email/i);
});

test('github deliver validates issue number for comment mode', async () => {
  const result = await githubDestination.deliver(capture(), { owner: 'acme', repo: 'snapflow', mode: 'comment', issue_number: 0 });
  assert.equal(result.ok, false);
  assert.match(result.detail, /issue number/i);
});

test('github deliver uses the backend after a cloud URL is available', async () => {
  configureIntegrationRuntime({
    sync: {
      run: async () => ({ pushed: 1, pulled: 0 }),
      waitForBlobUpload: async () => true,
    } as any,
  });
  let deliverCalls = 0;
  mockFetch((url) => {
    if (url === 'http://snapflow.test/v1/integrations/capture-url/cap_1') {
      return new Response(JSON.stringify({ url: 'http://public.test/capture.png' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'http://snapflow.test/v1/deliver') {
      deliverCalls += 1;
      return new Response(JSON.stringify({ ok: true, detail: 'Created issue', url: 'https://github.com/acme/snapflow/issues/1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });

  const result = await githubDestination.deliver(capture(), { owner: 'acme', repo: 'snapflow', mode: 'create' });
  assert.equal(deliverCalls, 1);
  assert.equal(result.ok, true);
  assert.match(result.url ?? '', /github\.com/);
});

test('zapier HMAC helpers sign and verify payloads', () => {
  const body = JSON.stringify({ capture_id: 'cap_1', test: true });
  const signature = signWebhookPayload(body, 'secret-key');
  assert.equal(verifyWebhookSignature(body, 'secret-key', signature), true);
  assert.equal(verifyWebhookSignature(body, 'wrong-key', signature), false);
});

test('zapier deliver surfaces non-2xx responses with response text', async () => {
  mockFetch(() => new Response('Webhook exploded hard', { status: 502 }));
  const result = await zapierDestination.deliver(capture(), { webhook_url: 'https://hooks.zapier.com/test', secret: 'abc', preset_name: 'Zapier' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /502/);
  assert.match(result.detail, /Webhook exploded/);
});

test('zapier deliver times out after 10 seconds', async () => {
  mockFetch(() => {
    const error = new Error('Aborted');
    (error as Error & { name: string }).name = 'AbortError';
    return Promise.reject(error);
  });
  const result = await zapierDestination.deliver(capture(), { webhook_url: 'https://hooks.zapier.com/test', preset_name: 'Zapier' });
  assert.equal(result.ok, false);
  assert.match(result.detail, /timed out/i);
});
