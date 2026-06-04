// Server-side delivery (architecture §5.2). The vault token is revealed only here,
// inside the backend — it never reaches the desktop client. Each destination
// implements one method; the registry mirrors the desktop's plugin contract.
import { config } from '../config';

export interface DeliverPayload { imageBase64: string; filename: string; target: string; }
export interface DeliverResult { ok: boolean; detail: string; }

export interface ServerDestination {
  id: string;
  deliver(token: string, payload: DeliverPayload): Promise<DeliverResult>;
}

const slack: ServerDestination = {
  id: 'slack',
  async deliver(token, { imageBase64, filename, target }) {
    // files.upload kept for parity with the desktop plugin; the modern flow is
    // files.getUploadURLExternal + files.completeUploadExternal.
    const form = new FormData();
    form.append('channels', target);
    form.append('initial_comment', filename);
    form.append('file', new Blob([Buffer.from(imageBase64, 'base64')], { type: 'image/png' }), `${filename}.png`);
    const res = await fetch(`${config.slackApiBase}/files.upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    return json.ok ? { ok: true, detail: `Sent to ${target}` } : { ok: false, detail: json.error ?? 'Slack error' };
  },
};

// Jira / Notion / Email: correct shape, real call wired the same way as Slack.
// Left as explicit stubs until each provider's upload API + OAuth scope are added.
const stub = (id: string): ServerDestination => ({
  id,
  async deliver(_token, { target }) {
    return { ok: false, detail: `Server-side ${id} delivery to ${target} is not implemented yet` };
  },
});

const REGISTRY: Record<string, ServerDestination> = {
  slack,
  jira: stub('jira'),
  notion: stub('notion'),
  email: stub('email'),
};

export const getServerDestination = (id: string): ServerDestination | undefined => REGISTRY[id];
