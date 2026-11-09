// The main↔renderer bridge for the dashboard window.
import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';
import type { AnnotationDocument, Capture, CaptureSource, Preset, ActivityEvent, Stats, Entitlements, DeliverResult, DestinationId, ScrollCapturePreview, Guide, GuideExportResult, GuideListItem, GuideType, IntegrationOption, IntegrationStatus, PiiScanResult, ColorFormat, PickedColor } from '../shared/types';

const api = {
  capture: {
    listSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke(CH.captureListSources),
    screen: (sourceId?: string): Promise<Capture> => ipcRenderer.invoke(CH.captureScreen, sourceId),
    scroll: (options?: { sourceId?: string; frames?: number; intervalMs?: number }): Promise<Capture> => ipcRenderer.invoke(CH.captureScroll, options),
    scrollPreview: (options?: { sourceId?: string; frames?: number; intervalMs?: number }): Promise<ScrollCapturePreview> => ipcRenderer.invoke(CH.captureScrollPreview, options),
    saveScrollPreview: (preview: { dataUrl: string; filename: string }): Promise<Capture> => ipcRenderer.invoke(CH.captureScrollSave, preview),
    saveAnnotated: (captureId: string, dataUrl: string): Promise<Capture> => ipcRenderer.invoke(CH.captureSaveAnnotated, { captureId, dataUrl }),
    saveFocusBlur: (captureId: string, dataUrl: string): Promise<Capture> =>
      ipcRenderer.invoke(CH.captureSaveFocusBlur, { captureId, dataUrl }),
    piiScan: (id: string): Promise<PiiScanResult> => ipcRenderer.invoke(CH.capturePiiScan, id),
    saveRedacted: (id: string, selectedIds?: string[]): Promise<Capture> =>
      ipcRenderer.invoke(CH.captureSaveRedacted, selectedIds?.length ? { id, selectedIds } : id),
    getAnnotations: (id: string): Promise<AnnotationDocument | null> => ipcRenderer.invoke(CH.captureAnnotationsGet, id),
    saveAnnotations: (captureId: string, doc: AnnotationDocument): Promise<DeliverResult> => ipcRenderer.invoke(CH.captureAnnotationsSave, { captureId, doc }),
    copyImage: (id: string): Promise<DeliverResult> => ipcRenderer.invoke(CH.captureCopyImage, id),
    copyOcr: (id: string): Promise<DeliverResult> => ipcRenderer.invoke(CH.captureCopyOcr, id),
    pin: (id: string): Promise<DeliverResult> => ipcRenderer.invoke(CH.capturePin, id),
    getImageDataUrl: (id: string): Promise<string | null> => ipcRenderer.invoke(CH.captureGetImage, id),
  },
  region: {
    start: (): Promise<{ started: boolean }> => ipcRenderer.invoke(CH.regionStart),
  },
  colour: {
    start: (): Promise<{ started: boolean }> => ipcRenderer.invoke(CH.colourStart),
    recent: (limit?: number): Promise<PickedColor[]> => ipcRenderer.invoke(CH.colourRecentList, limit),
    getFormat: (): Promise<ColorFormat> => ipcRenderer.invoke(CH.colourFormatGet),
    setFormat: (format: ColorFormat): Promise<ColorFormat> => ipcRenderer.invoke(CH.colourFormatSet, format),
  },
  history: {
    list: (limit?: number): Promise<Capture[]> => ipcRenderer.invoke(CH.historyList, limit),
    search: (query: string): Promise<Capture[]> => ipcRenderer.invoke(CH.historySearch, query),
    remove: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(CH.historyDelete, id),
  },
  presets: {
    list: (): Promise<Preset[]> => ipcRenderer.invoke(CH.presetsList),
    add: (p: { destination: DestinationId; name: string; target: string; config?: Record<string, unknown> }) => ipcRenderer.invoke(CH.presetsAdd, p),
    upsert: (p: { destination: DestinationId; name: string; target: string; config?: Record<string, unknown> }) => ipcRenderer.invoke(CH.presetsUpsert, p),
    remove: (id: string) => ipcRenderer.invoke(CH.presetsRemove, id),
    send: (captureId: string, presetId: string): Promise<DeliverResult> => ipcRenderer.invoke(CH.presetsSend, { captureId, presetId }),
  },
  integrations: {
    statuses: (): Promise<IntegrationStatus[]> => ipcRenderer.invoke(CH.integrationsStatuses),
    connect: (destination: DestinationId, params?: Record<string, string>): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke(CH.integrationsConnect, { destination, params }),
    disconnect: (destination: DestinationId): Promise<{ ok: boolean; detail: string }> => ipcRenderer.invoke(CH.integrationsDisconnect, destination),
    slackChannels: (): Promise<IntegrationOption[]> => ipcRenderer.invoke(CH.integrationsSlackChannels),
    notionPages: (query: string): Promise<IntegrationOption[]> => ipcRenderer.invoke(CH.integrationsNotionPages, query),
    gmailProfile: (): Promise<{ email: string }> => ipcRenderer.invoke(CH.integrationsGmailProfile),
    githubRepos: (query: string): Promise<IntegrationOption[]> => ipcRenderer.invoke(CH.integrationsGithubRepos, query),
    testZapier: (config: Record<string, unknown>): Promise<DeliverResult> => ipcRenderer.invoke(CH.integrationsZapierTest, config),
  },
  guides: {
    list: (): Promise<GuideListItem[]> => ipcRenderer.invoke(CH.guidesList),
    create: (args: { title: string; type: GuideType; captureIds: string[] }): Promise<Guide> => ipcRenderer.invoke(CH.guidesCreate, args),
    get: (id: string): Promise<Guide | null> => ipcRenderer.invoke(CH.guidesGet, id),
    update: (guide: Guide): Promise<DeliverResult & { guide?: Guide }> => ipcRenderer.invoke(CH.guidesUpdate, guide),
    exportMarkdown: (id: string): Promise<GuideExportResult> => ipcRenderer.invoke(CH.guidesExportMarkdown, id),
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
  onCaptureError: (cb: (message: string) => void): (() => void) => {
    const handler = (_e: unknown, message: string) => cb(message);
    ipcRenderer.on(CH.captureError, handler);
    return () => ipcRenderer.removeListener(CH.captureError, handler);
  },

  diff: {
    compute: (beforeId: string, afterId: string, options?: { threshold?: number; diffAlpha?: number; includeAA?: boolean }) =>
      ipcRenderer.invoke(CH.diffCompute, { beforeId, afterId, options }),
    summarise: (beforeId: string, afterId: string) => ipcRenderer.invoke(CH.diffSummarise, { beforeId, afterId }),
    getImage: (diffImagePath: string): Promise<string | null> => ipcRenderer.invoke(CH.diffGetImage, diffImagePath),
    save: (diffImagePath: string, beforeId: string, afterId: string) =>
      ipcRenderer.invoke(CH.diffSave, { diffImagePath, beforeId, afterId }),
    findPrevious: (captureId: string) => ipcRenderer.invoke(CH.diffFindPrevious, captureId),
  },
  sync: {
    now: (): Promise<import('../shared/types').SyncResult> => ipcRenderer.invoke(CH.syncNow),
    getEnabled: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke(CH.syncPrefGet),
    setEnabled: (enabled: boolean): Promise<{ enabled: boolean }> => ipcRenderer.invoke(CH.syncPrefSet, enabled),
  },
  team: {
    me: () => ipcRenderer.invoke(CH.teamMe),
    create: (name: string) => ipcRenderer.invoke(CH.teamCreate, name),
    invite: (args: { teamId: string; email: string; role?: 'admin' | 'member' }) => ipcRenderer.invoke(CH.teamInvite, args),
    leave: (teamId: string) => ipcRenderer.invoke(CH.teamLeave, teamId),
    shareCapture: (captureId: string) => ipcRenderer.invoke(CH.teamShareCapture, captureId),
  },

  /** Subscribe to the ⌘⇧5 global shortcut opening the window picker. Returns an unsubscribe fn. */
  onOpenWindowPicker: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on(CH.openWindowPicker, handler);
    return () => ipcRenderer.removeListener(CH.openWindowPicker, handler);
  },

  onColourPicked: (cb: (payload: { hex: string; formatted: string; format: ColorFormat; r: number; g: number; b: number }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { hex: string; formatted: string; format: ColorFormat; r: number; g: number; b: number }) => cb(payload);
    ipcRenderer.on(CH.colourPicked, handler);
    return () => ipcRenderer.removeListener(CH.colourPicked, handler);
  },

  onIntegrationConnected: (cb: (destination: DestinationId) => void): (() => void) => {
    const handler = (_e: unknown, destination: DestinationId) => cb(destination);
    ipcRenderer.on(CH.integrationConnected, handler);
    return () => ipcRenderer.removeListener(CH.integrationConnected, handler);
  },
  onIntegrationError: (cb: (destination: DestinationId | 'unknown', message: string) => void): (() => void) => {
    const handler = (_e: unknown, destination: DestinationId | 'unknown', message: string) => cb(destination, message);
    ipcRenderer.on(CH.integrationError, handler);
    return () => ipcRenderer.removeListener(CH.integrationError, handler);
  },
};

export type SnapFlowApi = typeof api;
contextBridge.exposeInMainWorld('snapflow', api);
