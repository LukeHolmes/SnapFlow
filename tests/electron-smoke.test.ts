import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const smokeScript = join(ROOT, 'scripts/electron-smoke-preload.cjs');
const preloadIndex = join(ROOT, 'out/preload/index.js');

test('electron smoke: sandboxed preload exposes window.snapflow', async (t) => {
  if (process.env.SKIP_ELECTRON_SMOKE === '1') {
    t.skip('SKIP_ELECTRON_SMOKE=1');
    return;
  }
  if (!process.env.DISPLAY && process.env.ELECTRON_SMOKE_XVFB !== '1') {
    t.skip('No DISPLAY — use xvfb-run for this smoke test');
    return;
  }

  try {
    await access(preloadIndex);
  } catch {
    t.skip('out/preload missing — run npm run build first');
    return;
  }

  const electron = (await import('electron')).default as unknown as string;

  const run = spawnSync(electron, [smokeScript], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    timeout: 90_000,
  });

  if (run.error) throw run.error;
  assert.equal(
    run.status,
    0,
    `electron smoke failed (status=${run.status}): stdout=${run.stdout}\nstderr=${run.stderr}`,
  );
  assert.match(run.stdout, /SMOKE_OK/);
});
