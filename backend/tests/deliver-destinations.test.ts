import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-deliver-more-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');
process.env.AUTH_SECRET = 'test-secret';
process.env.PUBLIC_BASE_URL = 'http://localhost:3999';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

const { initDb } = await import('../src/store');
await initDb();
const { vault } = await import('../src/vault/store');
const { getServerDestination } = await import('../src/deliver/destinations');
const { AppError } = await import('../src/errors');

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: URL | string | { url: string }, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

test('gmail deliver builds MIME and posts to Gmail send API', async () => {
  let sendBody = '';
  mockFetch((url, init) => {
    if (url.includes('gmail/v1/users/me/messages/send')) {
      sendBody = String(init?.body ?? '');
      return new Response('{}', { status: 200 });
    }
    throw new Error(`Unexpected ${url}`);
  });

  await vault.put('acct_gmail', 'gmail', JSON.stringify({ accessToken: 'gmail-token' }));
  const gmail = getServerDestination('gmail')!;
  const result = await gmail.deliver('acct_gmail', {
    captureId: 'cap_1',
    workspaceId: 'ws_local',
    imageBase64: Buffer.from('png').toString('base64'),
    filename: 'Bug report',
    config: { recipients: ['qa@example.com'] },
    metadata: { tag: 'ui', piiRedacted: false, createdAt: Date.now() },
  });
  assert.equal(result.ok, true);
  assert.match(sendBody, /"raw"/);
});

test('notion deliver appends image block with signed capture URL', async () => {
  let patchUrl = '';
  mockFetch((url) => {
    if (url.includes('/v1/blocks/') && url.includes('/children')) {
      patchUrl = url;
      return new Response('{}', { status: 200 });
    }
    throw new Error(`Unexpected ${url}`);
  });

  await vault.put('acct_notion', 'notion', JSON.stringify({ accessToken: 'notion-token' }));
  const notion = getServerDestination('notion')!;
  const result = await notion.deliver('acct_notion', {
    captureId: 'cap_2',
    workspaceId: 'ws_local',
    imageBase64: Buffer.from('png').toString('base64'),
    filename: 'Release',
    config: { page_id: 'page_abc' },
    metadata: { tag: null, piiRedacted: false, createdAt: Date.now() },
  });
  assert.equal(result.ok, true);
  assert.match(patchUrl, /page_abc/);
});

test('jira deliver surfaces not_connected when vault is empty', async () => {
  const jira = getServerDestination('jira')!;
  await assert.rejects(
    () => jira.deliver('acct_missing', {
      captureId: 'cap_3',
      workspaceId: 'ws_local',
      imageBase64: Buffer.from('png').toString('base64'),
      filename: 'Ticket',
      config: { issue_key: 'ENG-1' },
      metadata: { tag: 'bug', piiRedacted: false, createdAt: Date.now() },
    }),
    (err: unknown) => err instanceof AppError && err.code === 'not_connected',
  );
});
