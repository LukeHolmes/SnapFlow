// Shared domain types — the single contract between main, preload and renderer.

export type Tier = 'free' | 'pro' | 'team' | 'perpetual';
export type ColorFormat = 'hex' | 'rgb' | 'hsl';
export type ContentTag = 'code' | 'ui' | 'chart' | 'document' | 'web' | 'diff' | 'recording';
export type CaptureKind = 'screenshot' | 'recording';
export type DestinationId = 'clipboard' | 'slack' | 'notion' | 'gmail' | 'github' | 'zapier' | 'jira' | 'google-drive';
export type GuideType = 'sop' | 'bug_report' | 'training' | 'validation' | 'walkthrough';
export type AnnotationTool = 'arrow' | 'rect' | 'ellipse' | 'highlight' | 'text' | 'redact' | 'step' | 'callout' | 'blur';
export type PiiType = 'email' | 'phone' | 'name' | 'credit_card' | 'iban' | 'ip';

export interface RedactionBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FocusBlurRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
}

/** Non-destructive focus blur params stored on the capture annotation layer. */
export interface FocusBlurEffect {
  regions: FocusBlurRegion[];
  blurRadius: number;
  dimAmount: number;
  invert: boolean;
}

export interface PiiDetection {
  id: string;
  type: PiiType;
  value: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface PiiScanResult {
  imageDataUrl: string;
  detections: PiiDetection[];
}

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface CaptureAnnotation {
  id: string;
  type: AnnotationTool;
  start: AnnotationPoint;
  end: AnnotationPoint;
  color: string;
  text?: string;
  order?: number;
  zIndex?: number;
  style?: {
    strokeColor?: string;
    fillColor?: string;
    fillOpacity?: number;
    strokeWidth?: number;
    fontSize?: number;
    textColor?: string;
    highlightOpacity?: number;
    blurIntensity?: 'low' | 'medium' | 'high';
    arrowhead?: 'none' | 'single' | 'double' | 'open' | 'filled';
  };
}

export interface AnnotationEffects {
  border: boolean;
  shadow: boolean;
  watermark: string;
}

export interface AnnotationCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationDocument {
  annotations: CaptureAnnotation[];
  effects: AnnotationEffects;
  crop: AnnotationCrop | null;
  focusBlur?: FocusBlurEffect | null;
}

export interface Capture {
  id: string;
  workspaceId: string;        // multi-tenant from day one (architecture §9)
  filename: string;
  imagePath: string;
  kind: CaptureKind;
  tag: ContentTag | null;
  ocrText: string;
  hasPii: boolean;
  /** Set when a saved redacted copy was written to disk (stats counter). */
  piiRedactedApplied?: boolean;
  createdAt: number;          // epoch ms
  snippet?: string;           // populated by search results only
  hasAnnotations?: boolean;    // true when a non-destructive annotation layer exists
  /** WebM path for screen recordings (`kind === 'recording'`). */
  mediaPath?: string | null;
  durationMs?: number | null;
  byteSize?: number | null;
}

export interface AccountSummary {
  signedIn: boolean;
  email?: string;
  displayName?: string;
  tier?: Tier;
}

export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;          // data URL
  kind: 'screen' | 'window';
}

export type RecordingMode = 'screen' | 'window' | 'region';
export type RecordingPhase = 'idle' | 'countdown' | 'recording' | 'paused' | 'stopping' | 'saving' | 'error';

export interface RecordingCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecordingStartOptions {
  mode: RecordingMode;
  sourceId?: string;
  crop?: RecordingCrop;
  countdownSec?: number;
  includeMic?: boolean;
  includeSystemAudio?: boolean;
}

export interface RecordingStatus {
  phase: RecordingPhase;
  elapsedMs: number;
  maxDurationSec: number;
  paused: boolean;
  message?: string;
}

export interface ScrollCapturePreview {
  dataUrl: string;
  filename: string;
  confidence: number;
  frameCount: number;
  width: number;
  height: number;
  warnings: string[];
}

export interface Preset {
  id: string;
  workspaceId: string;
  destination: DestinationId;
  name: string;               // display name, e.g. "Slack"
  target: string;             // "#qa-bugs", "PROJ-441", "client@agency.com"
  config: Record<string, unknown>;
  createdAt: number;
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  kind: 'capture' | 'delivered' | 'delivery_failed' | 'delivery_queued' | 'pii' | 'tag' | 'color' | 'recording';
  text: string;
  createdAt: number;
}

export interface PickedColor {
  id: string;
  workspaceId: string;
  hex: string;
  r: number;
  g: number;
  b: number;
  createdAt: number;
}

export interface Stats {
  total: number;
  ocrIndexed: number;
  sent: number;
  piiRedacted: number;
}

export interface Entitlements {
  tier: Tier;
  historyWindowDays: number | null;  // null = unlimited
  maxPresets: number | null;         // null = unlimited
  aiEnabled: boolean;
  cloudSync: boolean;
  sharedLibrary?: boolean;           // backend Team search capability; optional for older desktop mirrors
  /** Sensitivity slider + changed-region boxes (local diff; free tier gets pixel diff + views). */
  diffAdvanced?: boolean;
  /** Free: one focus region; Pro/Team/Perpetual: unlimited. */
  focusBlurMaxRegions: number | null;
  /** Pro+ may auto-apply Focus Blur from output presets on deliver. */
  focusBlurPresetAutomation: boolean;
  /** Max single recording length (seconds). */
  maxRecordingDurationSec: number;
  recordingSystemAudio: boolean;
  recordingMicrophone: boolean;
  recordingGifExport: boolean;
}

export interface DeliverResult {
  ok: boolean;
  detail: string;
  url?: string;
  queued?: boolean;
}

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type IntegrationConnectionState = 'connected' | 'pending' | 'error' | 'disconnected';

export interface IntegrationStatus {
  destination: DestinationId;
  connected: boolean;
  state: IntegrationConnectionState;
  label?: string;
  secondary?: string;
  message?: string;
}

export interface IntegrationOption {
  id: string;
  label: string;
  secondary?: string;
}

export interface GuideStep {
  id: string;
  captureId: string;
  order: number;
  title: string;
  description: string;
  capture?: Capture;
}

export interface Guide {
  id: string;
  workspaceId: string;
  title: string;
  type: GuideType;
  summary: string;
  createdAt: number;
  updatedAt: number;
  steps: GuideStep[];
}

export interface GuideListItem {
  id: string;
  workspaceId: string;
  title: string;
  type: GuideType;
  summary: string;
  stepCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface GuideExportResult extends DeliverResult {
  markdown?: string;
}

/** A capture's metadata as it travels over the sync wire (no image bytes — blobs sync lazily). */
export interface SyncRecord {
  id: string;
  workspaceId: string;
  filename: string;
  tag: ContentTag | null;
  ocrText: string;
  hasPii: boolean;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;           // soft-delete tombstone
}

export interface SyncResult {
  skipped?: boolean;          // tier without cloudSync
  detail?: string;
  error?: string;
  pushed?: number;
  pulled?: number;
}
