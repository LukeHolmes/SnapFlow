import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient } from './common';

export interface SlackPresetConfig {
  channel_id: string;
  channel_name?: string;
  workspace_name?: string;
}

export const slackDestination: OutputDestination = {
  id: 'slack',
  label: 'Slack',
  requiresAuth: true,
  async deliver(capture, config) {
    const cfg = config as unknown as SlackPresetConfig;
    if (!cfg.channel_id) throw new NotConfiguredError('Slack');
    const backend = backendClient();
    if (!backend.configured) throw new NotConfiguredError('Slack');
    return backend.deliver('slack', capture, { ...cfg });
  },
};
