import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// Mock Slack API to capture what the destination sends.
let lastAuth = '';
let lastBody = '';
const server = createServer((req, res) => {
  lastAuth = req.headers.authorization ?? '';
  const chunks: Buffer[] = [];
  req.on('data', c => chunks.push(c as Buffer));
  req.on('end', () => { lastBody = Buffer.concat(chunks).toString(); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true })); });
});
await new Promise<void>(r => server.listen(0, () => r()));
server.unref();
const port = (server.address() as { port: number }).port;
process.env.SLACK_API_BASE = `http://localhost:${port}`;
const { getServerDestination } = await import('../src/deliver/destinations');

after(() => server.close());

test('slack destination uploads with the vault token and target channel', async () => {
  const slack = getServerDestination('slack')!;
  const result = await slack.deliver('xoxb-vault-token', {
    imageBase64: Buffer.from('png-bytes').toString('base64'), filename: 'Login bug', target: '#qa-bugs',
  });
  assert.equal(result.ok, true);
  assert.match(result.detail, /#qa-bugs/);
  assert.equal(lastAuth, 'Bearer xoxb-vault-token', 'token from the vault must be used as the bearer');
  assert.match(lastBody, /qa-bugs/, 'channel should be in the multipart body');
});

test('unknown destination is not registered', () => {
  assert.equal(getServerDestination('telegram'), undefined);
});

test('stubbed destinations return a not-implemented result (correct shape)', async () => {
  const jira = getServerDestination('jira')!;
  const r = await jira.deliver('tok', { imageBase64: 'x', filename: 'f', target: 'PROJ-1' });
  assert.equal(r.ok, false);
  assert.match(r.detail, /not implemented/);
});
