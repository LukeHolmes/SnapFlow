import { app, BrowserWindow, shell, globalShortcut } from 'electron';
import { join } from 'node:path';
import { CH } from '../shared/channels';
import { openDb } from './db';
import { dbPath } from './paths';
import { createEngine } from './engine';
import { registerIpc } from './ipc';
import { registerRegion, startRegionCapture } from './region';
import { createSyncAgent } from './sync/agent';
import { registerBuiltins } from './integrations/registry';
import { configureIntegrationRuntime } from './integrations/runtime';
import { disposeOcr } from './ocr';
import { closePinnedCaptures } from './pin';

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1024, minHeight: 680,
    backgroundColor: '#EDEBE5', titleBarStyle: 'hiddenInset', show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  const engine = createEngine(openDb(dbPath()));
  const sync = createSyncAgent(engine);
  registerBuiltins();
  configureIntegrationRuntime({ sync });
  registerIpc(engine, sync);
  registerRegion(engine, () => win);
  createWindow();

  // Cloud sync: a first pass shortly after launch, then periodically. No-op on
  // tiers without cloud sync, or when no backend is configured.
  setTimeout(() => void sync.run(), 4000);
  setInterval(() => void sync.run(), 45_000);

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

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', async () => {
  await disposeOcr();
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  closePinnedCaptures();
  globalShortcut.unregisterAll();
});
