/**
 * Headless smoke: packaged AppImage starts under xvfb (pass path as argv[1]).
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const appImage = process.argv[2];
if (!appImage) {
  console.error('Usage: node scripts/linux-appimage-smoke.cjs /path/to/SnapFlow.AppImage');
  process.exit(2);
}

const child = spawn(appImage, ['--no-sandbox'], {
  env: {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: '1',
    APPIMAGE_EXTRACT_AND_RUN: '1',
  },
  stdio: 'pipe',
});

let stderr = '';
child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

const timer = setTimeout(() => {
  child.kill('SIGTERM');
  console.log('linux-appimage-smoke: process stayed up 4s (ok)');
  process.exit(0);
}, 4000);

child.on('error', (err) => {
  clearTimeout(timer);
  console.error('linux-appimage-smoke spawn error:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (code === 0 || signal === 'SIGTERM') {
    console.log('linux-appimage-smoke: exit ok');
    process.exit(0);
  }
  console.error(`linux-appimage-smoke: exited code=${code} signal=${signal}\n${stderr}`);
  process.exit(code ?? 1);
});
