import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { OutputDestination } from './types';
import { NotConfiguredError } from './types';

// Real shape, real API call when a token is present. OAuth2 token capture is the
// next step (it belongs in the backend OAuth vault per §5.2, never on the client).
export const slackDestination: OutputDestination = {
  id: 'slack',
  label: 'Slack',
  requiresAuth: true,
  async deliver(capture, config) {
    const token = config.token as string | undefined;
    const channel = config.channel as string | undefined;
    if (!token || !channel) throw new NotConfiguredError('Slack');

    const file = readFileSync(capture.imagePath);
    const form = new FormData();
    form.append('channels', channel);
    form.append('initial_comment', capture.filename);
    form.append('file', new Blob([file], { type: 'image/png' }), basename(capture.imagePath));

    const res = await fetch('https://slack.com/api/files.upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    return json.ok ? { ok: true, detail: `Sent to ${channel}` } : { ok: false, detail: json.error ?? 'Slack error' };
  },
};
