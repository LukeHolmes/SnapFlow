import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';

// Stub with the correct contract. Appends an image block to a Notion page.
export const notionDestination: OutputDestination = {
  id: 'notion',
  label: 'Notion',
  requiresAuth: true,
  async deliver(_capture, config) {
    if (!config.token || !config.pageId) throw new NotConfiguredError('Notion');
    // PATCH /v1/blocks/{pageId}/children  with an image block
    return { ok: true, detail: 'Appended to page' };
  },
};
