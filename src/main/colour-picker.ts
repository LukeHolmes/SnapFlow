// Screen colour picker: multi-display overlays with a magnified loupe (like region.ts).

import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { CH } from '../shared/channels';
import { formatColor } from '../shared/color';
import { grabAllFrames, type Frame } from './capture';
import { sampleFrameAt } from './capture/pixel';
import type { Engine } from './engine';

let engineRef: Engine | null = null;
let getMainWindow: () => BrowserWindow | null = () => null;
let hiddenMainWindow: BrowserWindow | null = null;

interface PickerSession { win: BrowserWindow; frame: Frame; }
const sessions = new Map<number, PickerSession>();

export function registerColourPicker(engine: Engine, mainWindowGetter: () => BrowserWindow | null): void {
  engineRef = engine;
  getMainWindow = mainWindowGetter;

  ipcMain.handle(CH.colourStart, async () => {
    await startColourPicker();
    return { started: true };
  });
  ipcMain.handle(CH.colourPickerFrame, (e) => {
    const s = sessions.get(e.sender.id);
    return s ? { dataURL: s.frame.dataURL, width: s.frame.cssWidth, height: s.frame.cssHeight } : null;
  });
  ipcMain.handle(CH.colourPickerSample, (e, cssX: number, cssY: number) => {
    const s = sessions.get(e.sender.id);
    if (!s) return null;
    const sample = sampleFrameAt(s.frame, cssX, cssY);
    const format = engineRef?.colors.getFormat() ?? 'hex';
    return {
      ...sample,
      formatted: formatColor(sample.color, format),
      format,
    };
  });
  ipcMain.handle(CH.colourPickerPick, (e, cssX: number, cssY: number) => {
    const s = sessions.get(e.sender.id);
    if (!s || !engineRef) return { ok: false, detail: 'Picker session ended' };
    const sample = sampleFrameAt(s.frame, cssX, cssY);
    const format = engineRef.colors.getFormat();
    const text = formatColor(sample.color, format);
    clipboard.writeText(text);
    engineRef.colors.add(engineRef.workspace, sample.color.hex, sample.color);
    engineRef.events.append(engineRef.workspace, 'color', `Copied ${text} to clipboard`);
    const dash = getMainWindow();
    if (dash && !dash.isDestroyed()) dash.webContents.send(CH.colourPicked, { ...sample.color, formatted: text, format });
    closeAll();
    return { ok: true, detail: text, color: sample.color, formatted: text, format };
  });
  ipcMain.on(CH.colourPickerCancel, () => closeAll());
}

export async function startColourPicker(): Promise<void> {
  const engine = engineRef;
  if (!engine) throw new Error('Colour picker is not initialised');
  if (sessions.size) closeAll();
  registerPickerShortcuts();
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
      webPreferences: {
        preload: join(__dirname, '../preload/picker-overlay.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const id = win.webContents.id;
    let loadTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (sessions.has(id)) {
        emitPickerError('Colour picker overlay did not load. Please try again.');
        closeAll();
      }
    }, 5000);
    sessions.set(id, { win, frame });
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
      emitPickerError('Colour picker overlay failed to load.');
      closeAll();
    });
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        event.preventDefault();
        closeAll();
      }
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/picker-overlay.html`);
    } else {
      win.loadFile(join(__dirname, '../renderer/picker-overlay.html'));
    }
  }

  if (!sessions.size) {
    closeAll();
    throw new Error('No matching display was available for the colour picker.');
  }
}

function closeAll(): void {
  for (const { win } of sessions.values()) if (!win.isDestroyed()) win.close();
  sessions.clear();
  unregisterPickerShortcuts();
  restoreMainWindow();
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

function registerPickerShortcuts(): void {
  try {
    if (!globalShortcut.isRegistered('Esc')) {
      globalShortcut.register('Esc', () => closeAll());
    }
  } catch { /* overlay focus handles Escape */ }
}

function unregisterPickerShortcuts(): void {
  try {
    if (globalShortcut.isRegistered('Esc')) globalShortcut.unregister('Esc');
  } catch { /* non-fatal */ }
}

function emitPickerError(message: string): void {
  const dash = getMainWindow();
  if (dash && !dash.isDestroyed()) dash.webContents.send(CH.captureError, message);
}
