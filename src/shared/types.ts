export type ContentTag = 'ui' | 'code' | 'chart' | 'document' | 'web';

export type DestinationId = 'slack' | 'jira' | 'notion' | 'email' | 'clipboard';

export type Tier = 'free' | 'pro' | 'team' | 'perpetual';

export interface Capture {
  id: string;
  workspaceId: string;
  filename: string;
  imagePath: string;
  tag: ContentTag | null;
  ocrText: string;
  hasPii: boolean;
  createdAt: number;
  snippet?: string;
}

export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  kind: 'screen' | 'window';
}

export interface Preset {
  id: string;
  workspaceId: string;
  destination: DestinationId;
  name: string;
  target: string;
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
  historyWindowDays: number | null;
  maxPresets: number | null;
  aiEnabled: boolean;
  cloudSync: boolean;
  sharedLibrary?: boolean;
}

export interface DeliverResult {
  ok: boolean;
  detail: string;
}

export interface SyncRecord {
  id: string;
  workspaceId: string;
  filename: string;
  tag: ContentTag | null;
  ocrText: string;
  hasPii: boolean;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export interface SyncResult {
  pushed?: number;
  pulled?: number;
  skipped?: boolean;
  error?: string;
}
