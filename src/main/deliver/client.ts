// Delivery client. For destinations that need OAuth (Slack/Jira/Notion/email),
// the desktop sends the image + target to the backend, which holds the token in
// its vault and performs the delivery (architecture §5.2). The token is never here.
import { readFileSync } from 'node:fs';
import type { Capture, DeliverResult } from '../../shared/types';

export class DeliverClient {
  constructor(private baseUrl?: string, private token?: string) {}
  get configured(): boolean { return !!(this.baseUrl && this.token); }

  async deliver(destination: string, capture: Capture, target: string): Promise<DeliverResult> {
    if (!this.baseUrl || !this.token) return { ok: false, detail: 'Backend not configured' };
    const imageBase64 = readFileSync(capture.imagePath).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/deliver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ destination, imageBase64, filename: capture.filename, target }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string; message?: string };
    if (!res.ok) return { ok: false, detail: json.message ?? json.detail ?? `Delivery failed (${res.status})` };
    return { ok: !!json.ok, detail: json.detail ?? (json.ok ? 'Sent' : 'Delivery failed') };
  }
}

export const deliverClientFromEnv = (): DeliverClient =>
  new DeliverClient(process.env.SNAPFLOW_CLOUD_URL || process.env.SNAPFLOW_AI_PROXY_URL, process.env.SNAPFLOW_API_TOKEN);
