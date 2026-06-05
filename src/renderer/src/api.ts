// Typed access to the preload bridge. Falls back to an in-memory mock when opened
// in a plain browser (vite without Electron) so the UI still renders for design work.
import type { SnapFlowApi } from '../../preload';
import type { AnnotationDocument, Capture, Preset, ActivityEvent, Stats, Entitlements, CaptureSource, DeliverResult, ScrollCapturePreview, Guide, GuideExportResult, GuideListItem, GuideType, IntegrationStatus } from '../../shared/types';

declare global { interface Window { snapflow?: SnapFlowApi } }

const now = Date.now();
let mockCaptures: Capture[] = [
  { id: 'c1', workspaceId: 'ws_local', filename: 'Login page regression', imagePath: '', tag: 'ui', ocrText: 'Sign in invalid credentials 401', hasPii: true, createdAt: now - 120_000 },
  { id: 'c2', workspaceId: 'ws_local', filename: 'API error log', imagePath: '', tag: 'code', ocrText: 'TypeError cannot read property id of undefined', hasPii: false, createdAt: now - 840_000 },
  { id: 'c3', workspaceId: 'ws_local', filename: 'Q3 revenue chart', imagePath: '', tag: 'chart', ocrText: 'Q3 revenue up 18% YoY', hasPii: false, createdAt: now - 3_600_000 },
];
let mockPresets: Preset[] = [
  { id: 'p1', workspaceId: 'ws_local', destination: 'slack', name: 'Slack', target: '#qa-bugs', config: {}, createdAt: now },
  { id: 'p2', workspaceId: 'ws_local', destination: 'jira', name: 'Jira', target: 'ENG', config: {}, createdAt: now },
  { id: 'p3', workspaceId: 'ws_local', destination: 'notion', name: 'Notion', target: 'Release Notes', config: {}, createdAt: now },
  { id: 'p4', workspaceId: 'ws_local', destination: 'gmail', name: 'Gmail', target: 'client@agency.com', config: {}, createdAt: now },
  { id: 'p5', workspaceId: 'ws_local', destination: 'github', name: 'GitHub', target: 'acme/snapflow', config: {}, createdAt: now },
  { id: 'p6', workspaceId: 'ws_local', destination: 'zapier', name: 'Zapier', target: 'hooks.zapier.com', config: {}, createdAt: now },
];
let mockEvents: ActivityEvent[] = [
  { id: 'e1', workspaceId: 'ws_local', kind: 'capture', text: 'Login page capture saved & indexed', createdAt: now - 120_000 },
  { id: 'e2', workspaceId: 'ws_local', kind: 'delivered', text: 'Delivered to Slack · https://slack.com/files/F123', createdAt: now - 120_000 },
  { id: 'e3', workspaceId: 'ws_local', kind: 'pii', text: 'PII detected and redacted (email address)', createdAt: now - 840_000 },
  { id: 'e4', workspaceId: 'ws_local', kind: 'tag', text: "Auto-tagged as 'code'", createdAt: now - 840_000 },
];
let addedListener: ((c: Capture) => void) | null = null;
const mockAnnotationDocs = new Map<string, AnnotationDocument>();
let mockGuides: Guide[] = [];

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
    scrollPreview: async (): Promise<ScrollCapturePreview> => ({
      dataUrl: '',
      filename: 'Guided scroll preview',
      confidence: 0.92,
      frameCount: 4,
      width: 1280,
      height: 2400,
      warnings: [],
    }),
    saveScrollPreview: async (_preview: { dataUrl: string; filename: string }): Promise<Capture> => mockNewCapture(),
    saveAnnotated: async (_id: string, _dataUrl: string): Promise<Capture> => {
      const c = mockNewCapture();
      c.filename = `${c.filename} annotated`;
      return c;
    },
    saveRedacted: async (_id: string): Promise<Capture> => {
      const c = mockNewCapture();
      c.filename = `${c.filename} redacted`;
      c.hasPii = false;
      return c;
    },
    getAnnotations: async (id: string): Promise<AnnotationDocument | null> => mockAnnotationDocs.get(id) ?? null,
    saveAnnotations: async (captureId: string, doc: AnnotationDocument): Promise<DeliverResult> => {
      mockAnnotationDocs.set(captureId, doc);
      return { ok: true, detail: 'Annotation draft saved' };
    },
    copyImage: async (_id: string): Promise<DeliverResult> => ({ ok: true, detail: 'Copied image to clipboard' }),
    copyOcr: async (_id: string): Promise<DeliverResult> => ({ ok: true, detail: 'Copied OCR text to clipboard' }),
    pin: async (_id: string): Promise<DeliverResult> => ({ ok: true, detail: 'Pinned capture on screen' }),
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
    upsert: async (p: any) => {
      const existing = mockPresets.find(item => item.destination === p.destination);
      const preset: Preset = existing
        ? { ...existing, ...p, config: p.config ?? {}, target: p.target ?? existing.target }
        : { id: `${Date.now()}`, workspaceId: 'ws_local', ...p, config: p.config ?? {}, createdAt: Date.now() };
      mockPresets = existing
        ? mockPresets.map(item => item.id === existing.id ? preset : item)
        : [...mockPresets, preset];
      return { ok: true, preset };
    },
    remove: async (id: string) => { mockCaptures = mockCaptures.filter(c => c.id !== id); return { ok: true }; },
    send: async (_c: string, p: string): Promise<DeliverResult> => ({ ok: true, detail: 'Sent to ' + (mockPresets.find(x => x.id === p)?.target ?? 'destination') }),
  },
  integrations: {
    statuses: async (): Promise<IntegrationStatus[]> => ([
      { destination: 'slack', connected: true, state: 'connected', label: 'SnapFlow HQ', secondary: '#qa-bugs' },
      { destination: 'jira', connected: true, state: 'connected', label: 'ENG', secondary: 'Project' },
      { destination: 'notion', connected: true, state: 'connected', label: 'Release Notes', secondary: 'Share pages with SnapFlow' },
      { destination: 'gmail', connected: true, state: 'connected', label: 'luke@snapflow.app', secondary: 'Gmail' },
      { destination: 'github', connected: true, state: 'connected', label: 'acme/snapflow', secondary: 'repo' },
      { destination: 'zapier', connected: true, state: 'connected', label: 'hooks.zapier.com', secondary: 'Webhook configured' },
    ]),
    connect: async (_destination, _params) => ({ ok: true, detail: 'Opened OAuth provider' }),
    slackChannels: async () => ([{ id: 'C1', label: '#qa-bugs' }, { id: 'C2', label: '#design-reviews' }]),
    notionPages: async (query: string) => ([{ id: 'page_1', label: query ? `Result for ${query}` : 'Release Notes', secondary: 'Share this page with SnapFlow' }]),
    gmailProfile: async () => ({ email: 'luke@snapflow.app' }),
    githubRepos: async (query: string) => ([{ id: 'acme/snapflow', label: 'acme/snapflow', secondary: query ? 'Matched repo' : 'Public' }]),
    testZapier: async () => ({ ok: true, detail: 'Delivered to hooks.zapier.com' }),
  },
  guides: {
    list: async (): Promise<GuideListItem[]> => mockGuides.map(g => ({ ...g, stepCount: g.steps.length })),
    create: async ({ title, type, captureIds }: { title: string; type: GuideType; captureIds: string[] }): Promise<Guide> => {
      const guide: Guide = {
        id: 'g' + Math.random().toString(36).slice(2, 7),
        workspaceId: 'ws_local',
        title: title || 'New guide',
        type,
        summary: `Generated from ${captureIds.length} capture${captureIds.length === 1 ? '' : 's'}.`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        steps: captureIds.map((captureId, idx) => {
          const capture = mockCaptures.find(c => c.id === captureId) ?? mockCaptures[idx % mockCaptures.length];
          return {
            id: `gs${idx}`,
            captureId,
            order: idx + 1,
            title: `Step ${idx + 1}: ${capture?.filename ?? 'Capture'}`,
            description: capture?.ocrText || 'Describe this step.',
            capture,
          };
        }),
      };
      mockGuides = [guide, ...mockGuides];
      return guide;
    },
    get: async (id: string): Promise<Guide | null> => mockGuides.find(g => g.id === id) ?? null,
    update: async (guide: Guide): Promise<DeliverResult & { guide?: Guide }> => {
      mockGuides = mockGuides.map(g => g.id === guide.id ? { ...guide, updatedAt: Date.now() } : g);
      return { ok: true, detail: 'Guide saved', guide };
    },
    exportMarkdown: async (id: string): Promise<GuideExportResult> => {
      const guide = mockGuides.find(g => g.id === id);
      return { ok: !!guide, detail: guide ? 'Guide Markdown copied to clipboard' : 'Guide not found', markdown: guide ? `# ${guide.title}` : undefined };
    },
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
