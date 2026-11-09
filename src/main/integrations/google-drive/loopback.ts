import type { Server } from 'node:http';
import { createServer } from 'node:http';

export interface LoopbackCallback {
  code: string;
  state: string;
}

const LOOPBACK_PATH = '/oauth2callback';

export function startLoopbackOAuthServer(
  redirectUri: string,
  timeoutMs = 120_000,
): Promise<{ server: Server; waitForCallback: Promise<LoopbackCallback> }> {
  const parsed = new URL(redirectUri);
  const port = Number(parsed.port || 80);
  const expectedHost = parsed.hostname;

  let resolveCb!: (value: LoopbackCallback) => void;
  let rejectCb!: (err: Error) => void;
  const waitForCallback = new Promise<LoopbackCallback>((resolve, reject) => {
    resolveCb = resolve;
    rejectCb = reject;
  });

  const timer = setTimeout(() => {
    rejectCb(new Error('Google sign-in timed out'));
  }, timeoutMs);

  const server = createServer((req, res) => {
    try {
      if (!req.url?.startsWith(LOOPBACK_PATH)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const url = new URL(req.url, `http://${expectedHost}:${port}`);
      const code = url.searchParams.get('code') ?? '';
      const state = url.searchParams.get('state') ?? '';
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      if (error) {
        res.end('<p>Connection failed. You can close this tab and return to SnapFlow.</p>');
        clearTimeout(timer);
        rejectCb(new Error(error));
        return;
      }
      res.end('<p>Signed in — you can close this tab and return to SnapFlow.</p>');
      clearTimeout(timer);
      resolveCb({ code, state });
    } catch (err) {
      clearTimeout(timer);
      rejectCb(err instanceof Error ? err : new Error('Loopback OAuth failed'));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, waitForCallback });
    });
  });
}

export function stopLoopbackServer(server: Server | null): void {
  server?.close();
}
