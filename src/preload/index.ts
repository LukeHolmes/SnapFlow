// The main↔renderer bridge for the dashboard window.
import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';
import type { Capture, CaptureSource, Preset, ActivityEvent, Stats, Entitlements, DeliverResult, DestinationId } from '../shared/types';

const api = {
  capture: {
    listSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke(CH.captureListSources),
    screen: (sourceId?: string): Promise<Capture> => ipcRenderer.invoke(CH.captureScreen, sourceId),
    scroll: (options?: { sourceId?: string; frames?: number; intervalMs?: number }): Promise<Capture> => ipcRenderer.invoke(CH.captureScroll, options),
    saveAnnotated: (captureId: string, dataUrl: string): Promise<Capture> => ipcRenderer.invoke(CH.captureSaveAnnotated, { captureId, dataUrl }),
    copyImage: (id: string): Promise<DeliverResult> => ipcRenderer.invoke(CH.captureCopyImage, id),
    copyOcr: (id: string): Promise<DeliverResult> => ipcRenderer.invoke(CH.captureCopyOcr, id),
    getImageDataUrl: (id: string): Promise<string | null> => ipcRenderer.invoke(CH.captureGetImage, id),
  },
  region: {
    start: (): Promise<{ started: boolean }> => ipcRenderer.invoke(CH.regionStart),
  },
  history: {
    list: (limit?: number): Promise<Capture[]> => ipcRenderer.invoke(CH.historyList, limit),
    search: (query: string): Promise<Capture[]> => ipcRenderer.invoke(CH.historySearch, query),
    remove: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(CH.historyDelete, id),
  },
  presets: {
    list: (): Promise<Preset[]> => ipcRenderer.invoke(CH.presetsList),
    add: (p: { destination: DestinationId; name: string; target: string; config?: Record<string, unknown> }) => ipcRenderer.invoke(CH.presetsAdd, p),
    remove: (id: string) => ipcRenderer.invoke(CH.presetsRemove, id),
    send: (captureId: string, presetId: string): Promise<DeliverResult> => ipcRenderer.invoke(CH.presetsSend, { captureId, presetId }),
  },
  entitlements: { get: (): Promise<Entitlements> => ipcRenderer.invoke(CH.entitlementsGet) },
  stats: { get: (): Promise<Stats> => ipcRenderer.invoke(CH.statsGet) },
  events: { recent: (limit?: number): Promise<ActivityEvent[]> => ipcRenderer.invoke(CH.eventsRecent, limit) },

  /** Subscribe to captures completed outside this window (e.g. the region overlay). Returns an unsubscribe fn. */
  onCaptureAdded: (cb: (capture: Capture) => void): (() => void) => {
    const handler = (_e: unknown, capture: Capture) => cb(capture);
    ipcRenderer.on(CH.captureAdded, handler);
    return () => ipcRenderer.removeListener(CH.captureAdded, handler);
  },

  diff: {
    compute:    (beforeId: string, afterId: string) => ipcRenderer.invoke(CH.diffCompute,   { beforeId, afterId }),
    summarise:  (beforeId: string, afterId: string) => ipcRenderer.invoke(CH.diffSummarise, { beforeId, afterId }),
  },
  sync: {
    now: (): Promise<import('../shared/types').SyncResult> => ipcRenderer.invoke(CH.syncNow),
  },

  /** Subscribe to the ⌘⇧5 global shortcut opening the window picker. Returns an unsubscribe fn. */
  onOpenWindowPicker: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on(CH.openWindowPicker, handler);
    return () => ipcRenderer.removeListener(CH.openWindowPicker, handler);
  },
};

export type SnapFlowApi = typeof api;
contextBridge.exposeInMainWorld('snapflow', api);
