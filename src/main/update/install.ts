import { app, dialog, type BrowserWindow } from 'electron';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { autoUpdater } from 'electron-updater';
import { createUpdateController, isDevUpdateEnvironment } from './updater';

/** Linux packaged apps: use Chromium sandbox when setuid chrome-sandbox is present. */
export function configureLinuxChromeSandbox(): void {
  if (process.platform !== 'linux' || !app.isPackaged) return;
  const sandbox = join(process.resourcesPath, 'chrome-sandbox');
  try {
    accessSync(sandbox, constants.R_OK | constants.X_OK);
    return;
  } catch {
    app.commandLine.appendSwitch('no-sandbox');
  }
}

let controller: ReturnType<typeof createUpdateController> | null = null;

export function installAutoUpdate(getMainWindow: () => BrowserWindow | null): void {
  controller = createUpdateController({
    isPackaged: app.isPackaged,
    isDev: isDevUpdateEnvironment(),
    autoUpdater,
    dialog,
    log: console,
    getMainWindow,
  });
  controller.scheduleStartupCheck();
}

export function checkForUpdatesFromMenu(): void {
  void controller?.checkForUpdates({ userInitiated: true });
}
