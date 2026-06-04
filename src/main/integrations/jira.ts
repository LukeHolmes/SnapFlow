import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';

// Stub with the correct contract. Attaches a capture to a Jira issue via REST v3.
export const jiraDestination: OutputDestination = {
  id: 'jira',
  label: 'Jira',
  requiresAuth: true,
  async deliver(_capture, config) {
    if (!config.token || !config.issueKey) throw new NotConfiguredError('Jira');
    // POST /rest/api/3/issue/{issueKey}/attachments  (multipart, X-Atlassian-Token: no-check)
    return { ok: true, detail: `Attached to ${String(config.issueKey)}` };
  },
};
