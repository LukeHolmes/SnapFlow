import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';
import { backendClient, ensureCaptureUrl } from './common';

export interface GithubPresetConfig {
  owner: string;
  repo: string;
  mode: 'create' | 'comment';
  issue_number?: number;
}

export const githubDestination: OutputDestination = {
  id: 'github',
  label: 'GitHub',
  requiresAuth: true,
  async deliver(capture, config) {
    const cfg = config as unknown as GithubPresetConfig;
    if (!cfg.owner || !cfg.repo) throw new NotConfiguredError('GitHub');
    if (cfg.mode === 'comment' && (!Number.isInteger(cfg.issue_number) || Number(cfg.issue_number) <= 0)) {
      return { ok: false, detail: 'Issue number not found' };
    }
    const backend = backendClient();
    if (!backend.configured) throw new NotConfiguredError('GitHub');
    await ensureCaptureUrl(capture, { blobImagePath: capture.imagePath });
    return backend.deliver('github', capture, { ...cfg } as Record<string, unknown>);
  },
};
