// Region-capture controller: owns the freeze-frame overlay window(s) and their IPC.
//
// Multi-display: one transparent overlay is opened PER display, each showing that
// display's own frozen frame at its own scale factor. Sessions are keyed by the
// overlay's webContents id, so a confirm/cancel from any monitor is matched back
// to the right frame. Confirming on one display closes them all.

import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { CH } from '../shared/channels';
import { grabAllFrames, cropFrame, type Frame } from './capture';
import { contextualise } from './pipeline';
import type { Engine } from './engine';
import type { Capture } from '../shared/types';

let engineRef: Engine | null = null;
let getMainWindow: () => BrowserWindow | null = () => null;
let hiddenMainWindow: BrowserWindow | null = null;

interface SelectionRect { x: number; y: number; width: number; height: number; }
interface Session { win: BrowserWindow; frame: Frame; rect: SelectionRect | null; }
const sessions = new Map<number, Session>();   // keyed by webContents.id
let latestSelectionSender: number | null = null;

export function registerRegion(engine: Engine, mainWindowGetter: () => BrowserWindow | null): void {
  engineRef = engine;
  getMainWindow = mainWindowGetter;

  ipcMain.handle(CH.regionStart, async () => { await startRegionCapture(); return { started: true }; });
  ipcMain.handle(CH.overlayFrame, (e) => {
    const s = sessions.get(e.sender.id);
    return s ? { dataURL: s.frame.dataURL, width: s.frame.cssWidth, height: s.frame.cssHeight } : null;
  });
  ipcMain.on(CH.overlayUpdate, (e, rect: SelectionRect | null) => {
    const s = sessions.get(e.sender.id);
    if (!s) return;
    s.rect = rect;
    latestSelectionSender = rect ? e.sender.id : latestSelectionSender;
  });
  ipcMain.on(CH.overlayConfirm, (e, rect) => {
    const s = sessions.get(e.sender.id);
    if (!isUsableRect(rect)) {
      emitCaptureError('Select a larger region to capture.');
      return;
    }
    closeAll();
    if (s) void finish(s.frame, rect);
  });
  ipcMain.on(CH.overlayCancel, () => closeAll());
}

/** Public entry — called by the IPC handler and by the ⌘⇧4 global shortcut. */
export async function startRegionCapture(): Promise<void> {
  if (sessions.size) closeAll();                 // recover stale selectors before starting again
  registerSelectionShortcuts();
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
    closeAll();
    throw err;
  }
  const displays = screen.getAllDisplays();
  if (!frames.length) {
    closeAll();
    throw new Error('No screen source available. Check screen-recording permission and try again.');
  }

  for (const frame of frames) {
    const d = displays.find(x => x.id === frame.displayId);
    if (!d) continue;
    const win = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      show: false,
      transparent: true, frame: false, resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, fullscreenable: false,
      enableLargerThanScreen: true,
      webPreferences: { preload: join(__dirname, '../preload/overlay.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const id = win.webContents.id;
    let loadTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (sessions.has(id)) {
        emitCaptureError('Capture overlay did not load. Please try again.');
        closeAll();
      }
    }, 5000);
    sessions.set(id, { win, frame, rect: null });
    win.on('closed', () => {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = null;
      sessions.delete(id);
    });
    win.webContents.once('did-finish-load', () => {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = null;
      if (win.isDestroyed()) return;
      win.show();
      win.focus();
      win.webContents.focus();
    });
    win.webContents.once('did-fail-load', () => {
      emitCaptureError('Capture overlay failed to load. Please try again.');
      closeAll();
    });
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        event.preventDefault();
        closeAll();
      }
    });

    if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
    else win.loadFile(join(__dirname, '../renderer/overlay.html'));
  }

  if (!sessions.size) {
    closeAll();
    throw new Error('No matching display was available for region capture.');
  }
}

function closeAll(): void {
  for (const { win } of sessions.values()) if (!win.isDestroyed()) win.close();
  sessions.clear();
  latestSelectionSender = null;
  unregisterSelectionShortcuts();
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

function registerSelectionShortcuts(): void {
  try {
    if (!globalShortcut.isRegistered('Esc')) {
      globalShortcut.register('Esc', () => closeAll());
    }
    if (!globalShortcut.isRegistered('Enter')) {
      globalShortcut.register('Enter', () => confirmLatestSelection());
    }
  } catch {
    // Overlay window focus still handles shortcuts where global registration is unavailable.
  }
}

function unregisterSelectionShortcuts(): void {
  try {
    if (globalShortcut.isRegistered('Esc')) globalShortcut.unregister('Esc');
    if (globalShortcut.isRegistered('Enter')) globalShortcut.unregister('Enter');
  } catch {
    // Non-fatal during shutdown.
  }
}

function confirmLatestSelection(): void {
  const preferred = latestSelectionSender ? sessions.get(latestSelectionSender) : null;
  const session = preferred ?? [...sessions.values()].find(s => s.rect && s.rect.width >= 8 && s.rect.height >= 8);
  if (!session || !isUsableRect(session.rect)) {
    emitCaptureError('Select a region before confirming capture.');
    return;
  }
  const { frame, rect } = session;
  closeAll();
  void finish(frame, rect);
}

function emitCaptureError(message: string): void {
  const dash = getMainWindow();
  if (dash && !dash.isDestroyed()) dash.webContents.send(CH.captureError, message);
}

function isUsableRect(rect: SelectionRect | null | undefined): rect is SelectionRect {
  return !!rect && rect.width >= 8 && rect.height >= 8;
}
