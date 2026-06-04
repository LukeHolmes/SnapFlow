import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient, ensureCaptureUrl, queuedResult } from './common';

export interface NotionPresetConfig {
  page_id: string;
  page_title?: string;
}

export const notionDestination: OutputDestination = {
  id: 'notion',
  label: 'Notion',
  requiresAuth: true,
  async deliver(capture, config) {
    const cfg = config as unknown as NotionPresetConfig;
    if (!cfg.page_id) throw new NotConfiguredError('Notion');
    const backend = backendClient();
    if (!backend.configured) throw new NotConfiguredError('Notion');
    const url = await ensureCaptureUrl(capture);
    if (!url) return queuedResult();
    return backend.deliver('notion', capture, { ...cfg });
  },
};
