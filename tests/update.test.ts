import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createUpdateController } from '../src/main/update/updater';

type DialogStub = { showMessageBox: (...args: unknown[]) => Promise<{ response: number; checkboxChecked: boolean }> };

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = false;
  checkForUpdates = async () => ({});
  quitAndInstall = () => {};
}

test('startup check skipped when unpackaged / dev', async () => {
  const calls: unknown[] = [];
  const fake = new FakeUpdater();
  fake.checkForUpdates = async () => { calls.push('check'); return {}; };

  const ctrl = createUpdateController({
    isPackaged: false,
    isDev: true,
    autoUpdater: fake as unknown as import('electron-updater').AppUpdater,
    dialog: { showMessageBox: async () => ({ response: 0, checkboxChecked: false }) },
    log: console,
    getMainWindow: () => null,
  });

  await ctrl.checkForUpdates();
  assert.equal(calls.length, 0);

  let prompted = false;
  const ctrl2 = createUpdateController({
    isPackaged: false,
    isDev: true,
    autoUpdater: fake as unknown as import('electron-updater').AppUpdater,
    dialog: {
      showMessageBox: async () => {
        prompted = true;
        return { response: 0, checkboxChecked: false };
      },
    } as DialogStub,
    log: console,
    getMainWindow: () => null,
  });
  await ctrl2.checkForUpdates({ userInitiated: true });
  assert.equal(prompted, true);
});

test('packaged build checks for updates and prompts on download', async () => {
  let checked = false;
  const fake = new FakeUpdater();
  fake.checkForUpdates = async () => {
    checked = true;
    return {};
  };

  const prompts: string[] = [];
  const ctrl = createUpdateController({
    isPackaged: true,
    isDev: false,
    autoUpdater: fake as unknown as import('electron-updater').AppUpdater,
    dialog: {
      showMessageBox: async (first: unknown, second?: unknown) => {
        const opts = (second ?? first) as { message?: string };
        prompts.push(String(opts?.message ?? ''));
        return { response: 1, checkboxChecked: false };
      },
    } as DialogStub,
    log: console,
    getMainWindow: () => null,
  });

  await ctrl.checkForUpdates();
  assert.equal(checked, true);

  fake.emit('update-downloaded', { version: '1.2.0' });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(prompts.some(m => m.includes('1.2.0')), true);
});
