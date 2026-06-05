import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient, ensureCaptureUrl, queuedResult } from './common';

export interface NotionPresetConfig {
  page_id: string;
  page_title?: string;
  page_url?: string;
}

export const notionDestination: OutputDestination = {
  id: 'notion',
  label: 'Notion',
  requiresAuth: true,
  async deliver(capture, config) {
    const cfg = normaliseConfig(config);
    if (!cfg.page_id) throw new NotConfiguredError('Notion');
    const backend = backendClient();
    if (!backend.configured) throw new NotConfiguredError('Notion');
    const uploaded = await ensureCaptureUrl(capture);
    if (!uploaded) return queuedResult('Capture still syncing — Notion delivery queued');
    return backend.deliver('notion', capture, { ...cfg });
  },
};

function normaliseConfig(config: Record<string, unknown>): NotionPresetConfig {
  const pageId = extractPageId(config);
  return {
    page_id: pageId,
    page_title: typeof config.page_title === 'string' ? config.page_title : undefined,
    page_url: typeof config.page_url === 'string' ? config.page_url : undefined,
  } as NotionPresetConfig;
}

function extractPageId(config: Record<string, unknown>): string {
  const candidates = [
    typeof config.page_id === 'string' ? config.page_id : '',
    typeof (config as any).pageId === 'string' ? (config as any).pageId : '',
    typeof config.page_url === 'string' ? config.page_url : '',
  ];
  for (const candidate of candidates) {
    const id = toNotionId(candidate);
    if (id) return id;
  }
  return '';
}

function toNotionId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept raw IDs, UUIDs with hyphens, or full page URLs.
  const match = trimmed.match(/[0-9a-f]{32}/i);
  if (match) return match[0];
  return trimmed;
}
