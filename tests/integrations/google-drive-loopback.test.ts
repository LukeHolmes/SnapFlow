import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { startLoopbackOAuthServer, stopLoopbackServer } from '../../src/main/integrations/google-drive/loopback';

test('loopback OAuth server accepts Google Desktop PKCE redirect path', async () => {
  const redirectUri = 'http://127.0.0.1:47823/oauth2callback';
  const { server, waitForCallback } = await startLoopbackOAuthServer(redirectUri, 5_000);
  try {
    const url = new URL('/oauth2callback?code=test-code&state=test-state', redirectUri);
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port: 47823,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
        },
        res => {
          res.resume();
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.end();
    });
    const cb = await waitForCallback;
    assert.equal(cb.code, 'test-code');
    assert.equal(cb.state, 'test-state');
  } finally {
    stopLoopbackServer(server);
  }
});

test('loopback OAuth server rejects non-callback paths', async () => {
  const redirectUri = 'http://127.0.0.1:47824/oauth2callback';
  const { server, waitForCallback } = await startLoopbackOAuthServer(redirectUri, 2_000);
  const timeout = waitForCallback.catch((err: Error) => err);
  try {
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        { hostname: '127.0.0.1', port: 47824, path: '/other', method: 'GET' },
        res => {
          assert.equal(res.statusCode, 404);
          res.resume();
          res.on('end', () => resolve());
        },
      );
      req.on('error', reject);
      req.end();
    });
    const err = await timeout;
    assert.match(String(err), /timed out/i);
  } finally {
    stopLoopbackServer(server);
  }
});
