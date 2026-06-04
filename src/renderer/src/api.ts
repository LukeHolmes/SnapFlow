// Typed access to the preload bridge. Falls back to an in-memory mock when opened
// in a plain browser (vite without Electron) so the UI still renders for design work.
import type { SnapFlowApi } from '../../preload';
import type { Capture, Preset, ActivityEvent, Stats, Entitlements, CaptureSource, DeliverResult } from '../../shared/types';

declare global { interface Window { snapflow?: SnapFlowApi } }

const now = Date.now();
let mockCaptures: Capture[] = [
  { id: 'c1', workspaceId: 'ws_local', filename: 'Login page regression', imagePath: '', tag: 'ui', ocrText: 'Sign in invalid credentials 401', hasPii: true, createdAt: now - 120_000 },
  { id: 'c2', workspaceId: 'ws_local', filename: 'API error log', imagePath: '', tag: 'code', ocrText: 'TypeError cannot read property id of undefined', hasPii: false, createdAt: now - 840_000 },
  { id: 'c3', workspaceId: 'ws_local', filename: 'Q3 revenue chart', imagePath: '', tag: 'chart', ocrText: 'Q3 revenue up 18% YoY', hasPii: false, createdAt: now - 3_600_000 },
];
let mockPresets: Preset[] = [
  { id: 'p1', workspaceId: 'ws_local', destination: 'slack', name: 'Slack', target: '#qa-bugs', config: {}, createdAt: now },
  { id: 'p2', workspaceId: 'ws_local', destination: 'jira', name: 'Jira', target: 'PROJ-441', config: {}, createdAt: now },
  { id: 'p3', workspaceId: 'ws_local', destination: 'notion', name: 'Notion', target: 'Release Notes', config: {}, createdAt: now },
  { id: 'p4', workspaceId: 'ws_local', destination: 'email', name: 'Email', target: 'client@agency.com', config: {}, createdAt: now },
];
let mockEvents: ActivityEvent[] = [
  { id: 'e1', workspaceId: 'ws_local', kind: 'capture', text: 'Login page capture saved & indexed', createdAt: now - 120_000 },
  { id: 'e2', workspaceId: 'ws_local', kind: 'sent', text: 'Sent to #qa-bugs on Slack', createdAt: now - 120_000 },
  { id: 'e3', workspaceId: 'ws_local', kind: 'pii', text: 'PII detected and redacted (email address)', createdAt: now - 840_000 },
  { id: 'e4', workspaceId: 'ws_local', kind: 'tag', text: "Auto-tagged as 'code'", createdAt: now - 840_000 },
];
let addedListener: ((c: Capture) => void) | null = null;

function mockNewCapture(): Capture {
  const c: Capture = { id: 'c' + Math.random().toString(36).slice(2, 7), workspaceId: 'ws_local', filename: 'Region capture', imagePath: '', tag: 'ui', ocrText: 'demo capture', hasPii: false, createdAt: Date.now() };
  mockCaptures = [c, ...mockCaptures];
  mockEvents = [{ id: 'ev' + c.id, workspaceId: 'ws_local', kind: 'capture', text: `${c.filename} captured`, createdAt: c.createdAt }, ...mockEvents];
  return c;
}

const mock: SnapFlowApi = {
  capture: {
    listSources: async (): Promise<CaptureSource[]> => [
      { id: 'screen:0', name: 'Entire screen', thumbnail: '', kind: 'screen' },
      { id: 'window:1', name: 'Visual Studio Code', thumbnail: '', kind: 'window' },
      { id: 'window:2', name: 'Chrome — SnapFlow', thumbnail: '', kind: 'window' },
    ],
    screen: async (): Promise<Capture> => mockNewCapture(),
    scroll: async (): Promise<Capture> => mockNewCapture(),
    saveAnnotated: async (_id: string, _dataUrl: string): Promise<Capture> => {
      const c = mockNewCapture();
      c.filename = `${c.filename} annotated`;
      return c;
    },
    copyImage: async (_id: string): Promise<DeliverResult> => ({ ok: true, detail: 'Copied image to clipboard' }),
    copyOcr: async (_id: string): Promise<DeliverResult> => ({ ok: true, detail: 'Copied OCR text to clipboard' }),
    getImageDataUrl: async (_id: string): Promise<string | null> => null,
  },
  region: {
    start: async () => { const c = mockNewCapture(); setTimeout(() => addedListener?.(c), 350); return { started: true }; },
  },
  history: {
    list: async (limit = 50) => mockCaptures.slice(0, limit),
    search: async (q: string) => mockCaptures.filter(c => (c.filename + ' ' + c.ocrText).toLowerCase().includes(q.toLowerCase())),
    remove: async (id: string) => { mockCaptures = mockCaptures.filter(c => c.id !== id); return { ok: true }; },
  },
  presets: {
    list: async () => mockPresets,
    add: async (p: any) => {
      const preset: Preset = { id: `${Date.now()}`, workspaceId: 'ws_local', ...p, config: p.config ?? {}, createdAt: Date.now() };
      mockPresets = [...mockPresets, preset];
      return { ok: true, preset };
    },
    remove: async (id: string) => { mockCaptures = mockCaptures.filter(c => c.id !== id); return { ok: true }; },
    send: async (_c: string, p: string): Promise<DeliverResult> => ({ ok: true, detail: 'Sent to ' + (mockPresets.find(x => x.id === p)?.target ?? 'destination') }),
  },
  entitlements: { get: async (): Promise<Entitlements> => ({ tier: 'pro', historyWindowDays: null, maxPresets: 5, aiEnabled: true, cloudSync: true }) },
  stats: { get: async (): Promise<Stats> => ({ total: mockCaptures.length, ocrIndexed: mockCaptures.length, sent: 1, piiRedacted: mockCaptures.filter(c => c.hasPii).length }) },
  events: { recent: async (limit = 8) => mockEvents.slice(0, limit) },
  diff: {
    compute: async (_beforeId: string, _afterId: string) => ({
      ok: true, changedPixels: 12480, totalPixels: 921600,
      changePercent: 1.35, width: 1280, height: 720,
      diffImagePath: '', // no real path in browser mode
    }),
    summarise: async (_beforeId: string, _afterId: string) => ({
      ok: true,
      summary: 'The "Login" button label changed to "Sign in" and moved from the header to the hero section. A new "Try for free" secondary button was added beside it. The top navigation now shows the user avatar instead of account settings text.',
    }),
  },
  sync: { now: async () => ({ pushed: 0, pulled: 0 }) },
  onCaptureAdded: (cb) => { addedListener = cb; return () => { addedListener = null; }; },
  onOpenWindowPicker: () => () => {},
};

export const api: SnapFlowApi = window.snapflow ?? mock;
export const isLive = !!window.snapflow;
