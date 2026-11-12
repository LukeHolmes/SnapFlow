import { app, BrowserWindow, shell, globalShortcut, session, type WebContents } from 'electron';
import { configureLinuxChromeSandbox, installAutoUpdate } from './update/install';
import { installAppMenu } from './menu';
import { join } from 'node:path';
import { CH } from '../shared/channels';
import { openDb } from './db';
import { dbPath } from './paths';
import { createEngine } from './engine';
import { registerIpc } from './ipc';
import { registerRegion, startRegionCapture } from './region';
import { registerColourPicker, startColourPicker } from './colour-picker';
import { registerRecordingManager, startRecording } from './recording/manager';
import { installTray, disposeTray } from './tray';
import { createSyncAgent } from './sync/agent';
import { registerBuiltins } from './integrations/registry';
import { configureIntegrationRuntime } from './integrations/runtime';
import { disposeOcr } from './ocr';
import { closePinnedCaptures } from './pin';
import { parseAccountTokenDeepLink, parseDeepLinkUrl, parseGoogleDriveOAuthDeepLink } from './deep-link';
import { writeStoredApiToken } from './auth/token-store';
import { openExternalHttps } from './shell-safe';
import { completeGoogleDriveOAuthFromDeepLink } from './integrations/google-drive/service';
import { scheduleEntitlementsRefresh } from './entitlements';
import { DEV_CSP, PACKAGED_CSP } from './security/csp';

let win: BrowserWindow | null = null;
let engineRef: ReturnType<typeof createEngine> | null = null;

configureLinuxChromeSandbox();

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('snapflow', process.execPath, [process.argv[1]]);
  }
} else {
  app.setAsDefaultProtocolClient('snapflow');
}

function handleDeepLink(url: string): void {
  const accountToken = parseAccountTokenDeepLink(url);
  if (accountToken) {
    writeStoredApiToken(accountToken.token);
    engineRef?.entitlementsCache.clear();
    void engineRef?.entitlementsCache.refresh();
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      win.webContents.send(CH.authChanged);
    }
    return;
  }

  const google = parseGoogleDriveOAuthDeepLink(url);
  if (google) {
    void completeGoogleDriveOAuthFromDeepLink(google.code, google.state).then(result => {
      if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
      if (result.ok) {
        win?.webContents.send(CH.integrationConnected, 'google-drive');
      } else {
        win?.webContents.send(CH.integrationError, 'google-drive', result.detail);
      }
    });
    return;
  }

  const result = parseDeepLinkUrl(url);
  if (!result) return;

  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }

  if (result.kind === 'connected' && result.destination) {
    win?.webContents.send(CH.integrationConnected, result.destination);
  } else if (result.kind === 'error') {
    const message = result.message || 'OAuth connection failed';
    win?.webContents.send(CH.integrationError, result.destination ?? 'unknown', message);
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(arg => arg.startsWith('snapflow://'));
    if (url) handleDeepLink(url);
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function installContentSecurityPolicy(): void {
  const policy = app.isPackaged ? PACKAGED_CSP : DEV_CSP;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders, 'Content-Security-Policy': [policy] };
    callback({ responseHeaders });
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1024, minHeight: 680,
    backgroundColor: '#EDEBE5', titleBarStyle: 'hiddenInset', show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      openExternalHttps(url);
    } catch {
      /* block non-https */
    }
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}

function installSessionPermissions(): void {
  const allowed = new Set(['media', 'display-capture', 'fullscreen']);
  const allowForSession = (webContents: WebContents | null, permission: string) => {
    if (!webContents) return false;
    const host = webContents.getURL();
    if (host.startsWith('file://') || host.startsWith('devtools://')) return false;
    if (process.env.ELECTRON_RENDERER_URL && host.startsWith(process.env.ELECTRON_RENDERER_URL)) {
      return allowed.has(permission);
    }
    return false;
  };
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowForSession(wc, permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowForSession(wc, permission));
}

app.whenReady().then(() => {
  installContentSecurityPolicy();
  installSessionPermissions();
  const engine = createEngine(openDb(dbPath()));
  engineRef = engine;
  const stopEntitlementsRefresh = scheduleEntitlementsRefresh(engine.entitlementsCache);
  app.on('will-quit', () => stopEntitlementsRefresh());

  const sync = createSyncAgent(engine);
  registerBuiltins();
  configureIntegrationRuntime({ sync, engine });
  registerIpc(engine, sync);
  registerRegion(engine, () => win);
  registerColourPicker(engine, () => win);
  registerRecordingManager(engine, () => win);
  createWindow();
  installAutoUpdate(() => win);
  installAppMenu({
    showAbout: () => {
      win?.show();
      win?.focus();
      win?.webContents.send(CH.openAbout);
    },
  });
  installTray(() => win);

  const deepLinkArg = process.argv.find(arg => arg.startsWith('snapflow://'));
  if (deepLinkArg) {
    win?.webContents.once('did-finish-load', () => handleDeepLink(deepLinkArg));
  }

  // Metadata-only sync when opted in: no automatic blob upload (blobs upload on delivery or manual sync).
  const periodicSync = () => void sync.run({ uploadBlobs: false });
  setTimeout(periodicSync, 4000);
  setInterval(periodicSync, 45_000);

  // Global region-capture shortcut (design guide: ⌘⇧4).
  try {
    globalShortcut.register('CommandOrControl+Shift+4', () => {
      void startRegionCapture().catch(err => {
        win?.show();
        win?.focus();
        win?.webContents.send(CH.captureError, err instanceof Error ? err.message : 'Capture failed');
      });
    });
  } catch { /* non-fatal */ }
  // Global window-picker shortcut (design guide: ⌘⇧5).
  try {
    globalShortcut.register('CommandOrControl+Shift+5', () => { win?.show(); win?.focus(); win?.webContents.send(CH.openWindowPicker); });
  } catch { /* non-fatal */ }
  // Global colour picker (design guide: ⌘⇧7).
  try {
    globalShortcut.register('CommandOrControl+Shift+7', () => {
      void startColourPicker().catch(err => {
        win?.show();
        win?.focus();
        win?.webContents.send(CH.captureError, err instanceof Error ? err.message : 'Colour picker failed');
      });
    });
  } catch { /* non-fatal */ }
  // Screen recording (⌘⇧8) — full display, countdown from tray/dashboard.
  try {
    globalShortcut.register('CommandOrControl+Shift+8', () => {
      void startRecording({ mode: 'screen', countdownSec: 2 }).then(res => {
        if (!res.ok) {
          win?.show();
          win?.focus();
          win?.webContents.send(CH.captureError, res.detail);
        }
      });
    });
  } catch { /* non-fatal */ }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', async () => {
  await disposeOcr();
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  closePinnedCaptures();
  disposeTray();
  globalShortcut.unregisterAll();
});
