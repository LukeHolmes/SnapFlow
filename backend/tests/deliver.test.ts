import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'snapflow-deliver-'));
process.env.DATABASE_URL = '';
process.env.DB_PATH = join(dir, 'test.db');

let lastAuth = '';
let lastBody = '';
let uploadedBytes = 0;
const server = createServer((req, res) => {
  if (req.url?.startsWith('/files.getUploadURLExternal')) {
    lastAuth = req.headers.authorization ?? '';
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      lastBody = Buffer.concat(chunks).toString();
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, upload_url: `http://localhost:${port}/upload`, file_id: 'F123' }));
    });
    return;
  }
  if (req.url === '/upload') {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      uploadedBytes = Buffer.concat(chunks).length;
      res.statusCode = 200;
      res.end('ok');
    });
    return;
  }
  if (req.url?.startsWith('/files.completeUploadExternal')) {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      lastBody = Buffer.concat(chunks).toString();
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, files: [{ permalink: 'https://slack.example/files/F123' }] }));
    });
    return;
  }
  res.statusCode = 404;
  res.end('{}');
});
await new Promise<void>(r => server.listen(0, () => r()));
server.unref();
const port = (server.address() as { port: number }).port;
process.env.SLACK_API_BASE = `http://localhost:${port}`;

const { initDb } = await import('../src/store');
await initDb();
const { vault } = await import('../src/vault/store');
const { getServerDestination } = await import('../src/deliver/destinations');

after(() => server.close());

test('slack destination uploads with the vault token and channel id', async () => {
  await vault.put('acct_1', 'slack', JSON.stringify({ accessToken: 'xoxb-vault-token' }));
  const slack = getServerDestination('slack')!;
  const result = await slack.deliver('acct_1', {
    captureId: 'cap_1',
    workspaceId: 'ws_local',
    imageBase64: Buffer.from('png-bytes').toString('base64'),
    filename: 'Login bug',
    config: { channel_id: 'C123' },
    metadata: { tag: 'ui', ocrText: '', hasPii: false, createdAt: Date.now() },
  });
  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://slack.example/files/F123');
  assert.equal(lastAuth, 'Bearer xoxb-vault-token');
  assert.match(lastBody, /channel_id=C123/);
  assert.ok(uploadedBytes > 0);
});

test('unknown destination is not registered', () => {
  assert.equal(getServerDestination('telegram'), undefined);
});
