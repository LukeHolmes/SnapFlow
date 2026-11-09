import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient, ensureCaptureUrl } from './common';

export interface JiraPresetConfig {
  issue_key?: string;
  project_key?: string;
  issue_summary?: string;
  issue_description?: string;
}

export const jiraDestination: OutputDestination = {
  id: 'jira',
  label: 'Jira',
  requiresAuth: true,
  async deliver(capture, config) {
    const cfg = config as unknown as JiraPresetConfig;
    if (!cfg.issue_key && !cfg.project_key) {
      throw new NotConfiguredError('Jira');
    }
    const backend = backendClient();
    if (!backend.configured) throw new NotConfiguredError('Jira');

    await ensureCaptureUrl(capture);
    return backend.deliver('jira', capture, { ...cfg });
  },
};
