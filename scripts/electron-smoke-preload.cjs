/**
 * Minimal Electron smoke test: sandboxed dashboard preload must expose window.snapflow.
 * Usage: xvfb-run -a electron scripts/electron-smoke-preload.cjs
 */
const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');

const root = join(__dirname, '..');

// Chromium OS sandbox: pass `--no-sandbox` on the electron CLI in CI (see tests/electron-smoke.test.ts).
// Renderer preload sandbox (webPreferences.sandbox) remains enabled on the window below.
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(root, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('console-message', (_e, _level, message) => {
    if (message.includes('Preload') || message.includes('snapflow')) {
      process.stderr.write(`[renderer] ${message}\n`);
    }
  });

  await win.loadFile(join(root, 'out/renderer/index.html'));

  const probe = await win.webContents.executeJavaScript(`
    (function () {
      const s = typeof window.snapflow;
      if (s !== 'object' || !window.snapflow) return { ok: false, reason: 'missing' };
      const hasCapture = typeof window.snapflow.capture?.listSources === 'function';
      return { ok: hasCapture, reason: hasCapture ? 'ok' : 'incomplete' };
    })()
  `);

  if (!probe.ok) {
    console.error('SMOKE_FAIL', probe.reason);
    app.exit(1);
    return;
  }

  console.log('SMOKE_OK');
  app.exit(0);
}).catch(err => {
  console.error('SMOKE_FAIL', err);
  app.exit(1);
});
