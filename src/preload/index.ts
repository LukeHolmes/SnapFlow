// The main↔renderer bridge for the dashboard window.
import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';
import type { AnnotationDocument, Capture, CaptureSource, Preset, ActivityEvent, Stats, Entitlements, DeliverResult, DestinationId, ScrollCapturePreview, Guide, GuideExportResult, GuideListItem, GuideType, IntegrationOption, IntegrationStatus } from '../shared/types';

const api = {
  capture: {
    listSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke(CH.captureListSources),
    screen: (sourceId?: string): Promise<Capture> => ipcRenderer.invoke(CH.captureScreen, sourceId),
    scroll: (options?: { sourceId?: string; frames?: number; intervalMs?: number }): Promise<Capture> => ipcRenderer.invoke(CH.captureScroll, options),
    scrollPreview: (options?: { sourceId?: string; frames?: number; intervalMs?: number }): Promise<ScrollCapturePreview> => ipcRenderer.invoke(CH.captureScrollPreview, options),
    saveScrollPreview: (preview: { dataUrl: string; filename: string }): Promise<Capture> => ipcRenderer.invoke(CH.captureScrollSave, preview),
    saveAnnotated: (captureId: string, dataUrl: string): Promise<Capture> => ipcRenderer.invoke(CH.captureSaveAnnotated, { captureId, dataUrl }),
    saveRedacted: (id: string): Promise<Capture> => ipcRenderer.invoke(CH.captureSaveRedacted, id),
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
