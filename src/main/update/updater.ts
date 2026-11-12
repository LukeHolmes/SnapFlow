import { app, dialog, type BrowserWindow } from 'electron';
import type { AppUpdater } from 'electron-updater';

export type UpdateDialog = Pick<typeof dialog, 'showMessageBox'>;
export type UpdateLogger = Pick<Console, 'info' | 'warn' | 'error'>;

export interface UpdaterDeps {
  isPackaged: boolean;
  isDev: boolean;
  autoUpdater: AppUpdater;
  dialog: UpdateDialog;
  log: UpdateLogger;
  getMainWindow: () => BrowserWindow | null;
}

/** GitHub Releases provider; no-op in development unpackaged builds. */
export function createUpdateController(deps: UpdaterDeps) {
  const { autoUpdater } = deps;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  let wired = false;
  let checking = false;

  const enabled = () => deps.isPackaged && !deps.isDev;

  const wireEvents = () => {
    if (wired || !enabled()) return;
    wired = true;

    autoUpdater.on('checking-for-update', () => {
      deps.log.info('[update] checking');
    });

    autoUpdater.on('update-not-available', () => {
      checking = false;
      deps.log.info('[update] up to date');
    });

    autoUpdater.on('update-available', info => {
      deps.log.info('[update] available', info.version);
    });

    autoUpdater.on('error', err => {
      checking = false;
      deps.log.warn('[update] error', err instanceof Error ? err.message : err);
    });

    autoUpdater.on('download-progress', p => {
      deps.log.info(`[update] download ${Math.round(p.percent)}%`);
    });

    autoUpdater.on('update-downloaded', info => {
      checking = false;
      void promptInstall(deps, info.version);
    });
  };

  const checkForUpdates = async (opts?: { userInitiated?: boolean }) => {
    if (!enabled()) {
      if (opts?.userInitiated) {
        await deps.dialog.showMessageBox({
          type: 'info',
          title: 'Updates',
          message: 'Updates are disabled in development builds.',
          buttons: ['OK'],
        });
      }
      return;
    }
    if (checking) return;
    checking = true;
    wireEvents();
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      checking = false;
      if (opts?.userInitiated) {
        await deps.dialog.showMessageBox({
          type: 'error',
          title: 'Update check failed',
          message: err instanceof Error ? err.message : 'Could not check for updates',
          buttons: ['OK'],
        });
      }
    }
  };

  const scheduleStartupCheck = (delayMs = 8_000) => {
    if (!enabled()) return;
    setTimeout(() => { void checkForUpdates(); }, delayMs);
  };

  return { checkForUpdates, scheduleStartupCheck, enabled };
}

async function promptInstall(deps: UpdaterDeps, version: string) {
  const win = deps.getMainWindow();
  const options = {
    type: 'info' as const,
    title: 'Update ready',
    message: `SnapFlow ${version} has been downloaded.`,
    detail: 'Restart now to install the update? You can also restart later from the tray.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = win && !win.isDestroyed()
    ? await deps.dialog.showMessageBox(win, options)
    : await deps.dialog.showMessageBox(options);
  if (response === 0) {
    deps.autoUpdater.quitAndInstall(false, true);
  }
}

export function isDevUpdateEnvironment(): boolean {
  return !!process.env.ELECTRON_RENDERER_URL || !app.isPackaged;
}
