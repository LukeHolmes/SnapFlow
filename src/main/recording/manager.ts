// Screen recording orchestration — owns worker / control / indicator windows.
import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { CH } from '../../shared/channels';
import type {
  Entitlements,
  RecordingStartOptions,
  RecordingStatus,
} from '../../shared/types';
import type { Engine } from '../engine';
import { desktopCapturer, screen as electronScreen } from 'electron';
import { pickRegionRect } from '../region';
import {
  recordingInitialState,
  recordingTransition,
  type RecordingMachineState,
} from './state-machine';
import { maxDurationMs, validateRecordingStart } from './limits';
import {
  appendWebmChunk,
  fileSizeBytes,
  newRecordingPaths,
  writeThumbnailPng,
  writeWebmFromBase64,
} from './persist';
import { finalizeRecording } from './finalize';

let engine: Engine | null = null;
let getMainWindow: () => BrowserWindow | null = () => null;

let machine: RecordingMachineState = recordingInitialState();
let maxMs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
let pausedAccum = 0;
let pauseStarted = 0;

let workerWin: BrowserWindow | null = null;
let controlWin: BrowserWindow | null = null;
let indicatorWin: BrowserWindow | null = null;

let activePaths: { webmPath: string; thumbPath: string; id: string } | null = null;
let chunkFirst = true;
let pendingOpts: RecordingStartOptions | null = null;

export function registerRecordingManager(eng: Engine, mainWindowGetter: () => BrowserWindow | null): void {
  engine = eng;
  getMainWindow = mainWindowGetter;

  ipcMain.handle(CH.recordingStart, async (_e, opts: RecordingStartOptions) => {
    return startRecording(opts);
  });
  ipcMain.handle(CH.recordingStop, async () => stopRecording());
  ipcMain.handle(CH.recordingPause, async () => pauseRecording());
  ipcMain.handle(CH.recordingResume, async () => resumeRecording());
  ipcMain.handle(CH.recordingStatusGet, () => statusSnapshot());

  ipcMain.on(CH.recWorkerChunk, (_e, base64: string) => {
    if (!activePaths) return;
    appendWebmChunk(activePaths.webmPath, base64, chunkFirst);
    chunkFirst = false;
  });

  ipcMain.on(CH.recWorkerDone, (_e, payload: { webmBase64?: string; thumbPngBase64: string; durationMs: number }) => {
    void onWorkerDone(payload);
  });

  ipcMain.on(CH.recWorkerError, (_e, message: string) => {
    failRecording(message || 'Recording failed');
  });

  ipcMain.on(CH.recControlStop, () => { void stopRecording(); });
  ipcMain.on(CH.recControlPause, () => { void pauseRecording(); });
  ipcMain.on(CH.recControlResume, () => { void resumeRecording(); });
}

export async function startRecording(opts: RecordingStartOptions): Promise<{ ok: boolean; detail: string }> {
  if (!engine) return { ok: false, detail: 'Engine not ready' };
  if (machine.phase !== 'idle' && machine.phase !== 'error') {
    return { ok: false, detail: 'A recording is already in progress' };
  }

  const ent = engine.ent();
  const err = validateRecordingStart(ent, opts);
  if (err) return { ok: false, detail: err };

  let resolved = { ...opts };
  try {
    if (resolved.mode === 'region') {
      if (!resolved.crop) {
        const { rect, frame } = await pickRegionRect();
        const scale = frame.scaleFactor ?? 1;
        resolved = {
          ...resolved,
          sourceId: frame.sourceId,
          crop: {
            x: Math.round(rect.x * scale),
            y: Math.round(rect.y * scale),
            width: Math.round(rect.width * scale),
            height: Math.round(rect.height * scale),
          },
        };
      }
    } else if (resolved.mode === 'screen' && !resolved.sourceId) {
      resolved.sourceId = await primaryScreenSourceId();
    } else if (resolved.mode === 'window' && !resolved.sourceId) {
      return { ok: false, detail: 'Choose a window to record' };
    }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'Could not prepare recording' };
  }

  pendingOpts = resolved;
  maxMs = maxDurationMs(ent);
  machine = recordingTransition(recordingInitialState(), { type: 'ARM', countdownSec: resolved.countdownSec ?? 0 });
  pushStatus(ent);

  const countdown = Math.max(0, Math.min(10, resolved.countdownSec ?? 0));
  if (countdown > 0) {
    await sleep(countdown * 1000);
  }
  machine = recordingTransition(machine, { type: 'COUNTDOWN_DONE' });
  pushStatus(ent);

  try {
    await ensureWorkerWindow();
    openIndicator();
    openControl();
    activePaths = newRecordingPaths(`Screen recording ${new Date().toLocaleString()}`);
    chunkFirst = true;

    const payload = buildWorkerPayload(resolved, ent);
    workerWin?.webContents.send(CH.recWorkerStart, payload);

    startedAt = Date.now();
    pausedAccum = 0;
    pauseStarted = 0;
    startTimer(ent);
    return { ok: true, detail: 'Recording started' };
  } catch (e) {
    failRecording(e instanceof Error ? e.message : 'Could not start recorder');
    return { ok: false, detail: e instanceof Error ? e.message : 'Could not start recorder' };
  }
}

export async function stopRecording(): Promise<{ ok: boolean }> {
  if (machine.phase !== 'recording' && machine.phase !== 'paused') return { ok: false };
  machine = recordingTransition(machine, { type: 'STOP' });
  pushStatus(engine!.ent());
  stopTimer();
  workerWin?.webContents.send('recording:stopEncoder');
  return { ok: true };
}

async function pauseRecording(): Promise<{ ok: boolean }> {
  if (machine.phase !== 'recording') return { ok: false };
  machine = recordingTransition(machine, { type: 'PAUSE' });
  pauseStarted = Date.now();
  pushStatus(engine!.ent());
  workerWin?.webContents.send('recording:pauseEncoder');
  return { ok: true };
}

async function resumeRecording(): Promise<{ ok: boolean }> {
  if (machine.phase !== 'paused') return { ok: false };
  pausedAccum += Date.now() - pauseStarted;
  machine = recordingTransition(machine, { type: 'RESUME' });
  pushStatus(engine!.ent());
  workerWin?.webContents.send('recording:resumeEncoder');
  return { ok: true };
}

function startTimer(ent: Entitlements): void {
  stopTimer();
  timer = setInterval(() => {
    const elapsed = elapsedMs();
    machine = recordingTransition(machine, { type: 'TICK', elapsedMs: elapsed });
    pushStatus(ent);
    if (elapsed >= maxMs) {
      machine = recordingTransition(machine, { type: 'MAX_DURATION' });
      pushStatus(ent);
      void stopRecording();
    }
  }, 250);
}

function stopTimer(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function elapsedMs(): number {
  if (!startedAt) return machine.elapsedMs;
  const now = Date.now();
  const pauseExtra = machine.phase === 'paused' ? now - pauseStarted : 0;
  return now - startedAt - pausedAccum - pauseExtra;
}

async function onWorkerDone(payload: { webmBase64?: string; thumbPngBase64: string; durationMs: number }): Promise<void> {
  const eng = engine;
  if (!eng || !activePaths) return;
  machine = { ...machine, phase: 'saving' };
  pushStatus(eng.ent());

  try {
    if (payload.webmBase64) writeWebmFromBase64(activePaths.webmPath, payload.webmBase64);
    writeThumbnailPng(activePaths.thumbPath, payload.thumbPngBase64);
    const byteSize = fileSizeBytes(activePaths.webmPath);
    const capture = finalizeRecording({
      engine: eng,
      id: activePaths.id,
      filename: `Screen recording ${new Date().toLocaleDateString()}`,
      thumbPath: activePaths.thumbPath,
      webmPath: activePaths.webmPath,
      durationMs: payload.durationMs,
      byteSize,
    });
    machine = recordingTransition(machine, { type: 'SAVE_DONE' });
    pushStatus(eng.ent());
    teardownWindows();
    const dash = getMainWindow();
    dash?.webContents.send(CH.captureAdded, capture);
  } catch (e) {
    failRecording(e instanceof Error ? e.message : 'Could not save recording');
  } finally {
    activePaths = null;
    pendingOpts = null;
  }
}

function failRecording(message: string): void {
  machine = recordingTransition(machine, { type: 'FAIL', message });
  if (engine) pushStatus(engine.ent());
  stopTimer();
  teardownWindows();
  activePaths = null;
  pendingOpts = null;
  const dash = getMainWindow();
  dash?.webContents.send(CH.captureError, message);
}

function statusSnapshot(): RecordingStatus {
  const ent = engine?.ent();
  return {
    phase: machine.phase,
    elapsedMs: elapsedMs(),
    maxDurationSec: ent?.maxRecordingDurationSec ?? 0,
    paused: machine.paused,
    message: machine.message,
  };
}

function pushStatus(ent: Entitlements): void {
  const status = statusSnapshot();
  getMainWindow()?.webContents.send(CH.recordingStatus, status);
  controlWin?.webContents.send(CH.recordingStatus, status);
}

function buildWorkerPayload(opts: RecordingStartOptions, ent: Entitlements) {
  return {
    sourceId: opts.sourceId,
    crop: opts.crop ?? null,
    includeMic: !!opts.includeMic && ent.recordingMicrophone,
    includeSystemAudio: !!opts.includeSystemAudio && ent.recordingSystemAudio,
    maxDurationMs: maxMs,
    mimeType: 'video/webm;codecs=vp9',
  };
}

async function ensureWorkerWindow(): Promise<void> {
  if (workerWin && !workerWin.isDestroyed()) return;
  workerWin = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: join(__dirname, '../preload/recording-worker.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await workerWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/recording-worker.html`);
  } else {
    await workerWin.loadFile(join(__dirname, '../renderer/recording-worker.html'));
  }
}

function openControl(): void {
  const display = screen.getPrimaryDisplay();
  const w = 220;
  const h = 52;
  controlWin = new BrowserWindow({
    width: w,
    height: h,
    x: display.workArea.x + display.workArea.width - w - 24,
    y: display.workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/recording-control.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  controlWin.setAlwaysOnTop(true, 'screen-saver');
  if (process.env.ELECTRON_RENDERER_URL) {
    controlWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/recording-control.html`);
  } else {
    controlWin.loadFile(join(__dirname, '../renderer/recording-control.html'));
  }
}

function openIndicator(): void {
  const display = screen.getPrimaryDisplay();
  indicatorWin = new BrowserWindow({
    width: 180,
    height: 36,
    x: display.workArea.x + 16,
    y: display.workArea.y + 16,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  indicatorWin.setIgnoreMouseEvents(true);
  indicatorWin.setAlwaysOnTop(true, 'screen-saver');
  if (process.env.ELECTRON_RENDERER_URL) {
    indicatorWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/recording-indicator.html`);
  } else {
    indicatorWin.loadFile(join(__dirname, '../renderer/recording-indicator.html'));
  }
}

function teardownWindows(): void {
  if (controlWin && !controlWin.isDestroyed()) controlWin.close();
  if (indicatorWin && !indicatorWin.isDestroyed()) indicatorWin.close();
  controlWin = null;
  indicatorWin = null;
  // Keep worker window for reuse.
}

async function primaryScreenSourceId(): Promise<string> {
  const primary = electronScreen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 10, height: 10 } });
  const match = sources.find(s => s.display_id === String(primary.id)) ?? sources[0];
  if (!match) throw new Error('No screen source available (check screen-recording permission)');
  return match.id;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
