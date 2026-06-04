// Region-capture controller: owns the freeze-frame overlay window(s) and their IPC.
//
// Multi-display: one transparent overlay is opened PER display, each showing that
// display's own frozen frame at its own scale factor. Sessions are keyed by the
// overlay's webContents id, so a confirm/cancel from any monitor is matched back
// to the right frame. Confirming on one display closes them all.

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { CH } from '../shared/channels';
import { grabAllFrames, cropFrame, type Frame } from './capture';
import { contextualise } from './pipeline';
import type { Engine } from './engine';
import type { Capture } from '../shared/types';

let engineRef: Engine | null = null;
let getMainWindow: () => BrowserWindow | null = () => null;
let hiddenMainWindow: BrowserWindow | null = null;

interface Session { win: BrowserWindow; frame: Frame; }
const sessions = new Map<number, Session>();   // keyed by webContents.id

export function registerRegion(engine: Engine, mainWindowGetter: () => BrowserWindow | null): void {
  engineRef = engine;
  getMainWindow = mainWindowGetter;

  ipcMain.handle(CH.regionStart, async () => { await startRegionCapture(); return { started: true }; });
  ipcMain.handle(CH.overlayFrame, (e) => {
    const s = sessions.get(e.sender.id);
    return s ? { dataURL: s.frame.dataURL, width: s.frame.cssWidth, height: s.frame.cssHeight } : null;
  });
  ipcMain.on(CH.overlayConfirm, (e, rect) => {
    const s = sessions.get(e.sender.id);
    closeAll();
    if (s) void finish(s.frame, rect);
  });
  ipcMain.on(CH.overlayCancel, () => closeAll());
}

/** Public entry — called by the IPC handler and by the ⌘⇧4 global shortcut. */
export async function startRegionCapture(): Promise<void> {
  if (sessions.size) return;                     // already selecting
  const main = getMainWindow();
  if (main && !main.isDestroyed() && main.isVisible()) {
    hiddenMainWindow = main;
    main.hide();
    await sleep(120);
  }
  let frames: Frame[];
  try {
    frames = await grabAllFrames();
  } catch (err) {
    restoreMainWindow();
    throw err;
  }
  if (!frames.length) {
    restoreMainWindow();
    return;
  }
  const displays = screen.getAllDisplays();

  for (const frame of frames) {
    const d = displays.find(x => x.id === frame.displayId);
    if (!d) continue;
    const win = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      transparent: true, frame: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, fullscreenable: false,
      enableLargerThanScreen: true,
      webPreferences: { preload: join(__dirname, '../preload/overlay.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const id = win.webContents.id;
    sessions.set(id, { win, frame });
    win.on('closed', () => sessions.delete(id));

    if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
    else win.loadFile(join(__dirname, '../renderer/overlay.html'));
  }
}

function closeAll(): void {
  for (const { win } of sessions.values()) if (!win.isDestroyed()) win.close();
  sessions.clear();
  restoreMainWindow();
}

async function finish(frame: Frame, rect: { x: number; y: number; width: number; height: number } | null): Promise<void> {
  const engine = engineRef;
  if (!rect || !frame || !engine) return;
  if (rect.width < 8 || rect.height < 8) return;   // treat a tiny drag as a cancel

  const raw = cropFrame(frame, rect);
  const capture: Capture = {
    id: raw.id, workspaceId: engine.workspace, filename: raw.filename, imagePath: raw.imagePath,
    tag: null, ocrText: '', hasPii: false, createdAt: Date.now(),
  };
  engine.history.insert(capture);
  const enriched = await contextualise(capture, engine.ent(), engine.history, engine.events);

  const dash = getMainWindow();
  if (dash && !dash.isDestroyed()) dash.webContents.send(CH.captureAdded, enriched);
}

app.on('will-quit', () => closeAll());

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function restoreMainWindow(): void {
  if (hiddenMainWindow && !hiddenMainWindow.isDestroyed()) {
    hiddenMainWindow.show();
    hiddenMainWindow.focus();
  }
  hiddenMainWindow = null;
}
