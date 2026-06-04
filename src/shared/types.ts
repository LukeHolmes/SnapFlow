// Shared domain types — the single contract between main, preload and renderer.

export type Tier = 'free' | 'pro' | 'team' | 'perpetual';
export type ContentTag = 'code' | 'ui' | 'chart' | 'document' | 'web';
export type DestinationId = 'clipboard' | 'slack' | 'jira' | 'notion' | 'email';
export type GuideType = 'sop' | 'bug_report' | 'training' | 'validation' | 'walkthrough';
export type AnnotationTool = 'arrow' | 'rect' | 'highlight' | 'text' | 'redact' | 'step' | 'callout' | 'blur';

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
}

export interface Capture {
  id: string;
  workspaceId: string;        // multi-tenant from day one (architecture §9)
  filename: string;
  imagePath: string;
  tag: ContentTag | null;
  ocrText: string;
  hasPii: boolean;
  createdAt: number;          // epoch ms
  snippet?: string;           // populated by search results only
}

export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;          // data URL
  kind: 'screen' | 'window';
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
  kind: 'capture' | 'sent' | 'pii' | 'tag';
  text: string;
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
}

export interface DeliverResult {
  ok: boolean;
  detail: string;
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
  error?: string;
  pushed?: number;
  pulled?: number;
}
