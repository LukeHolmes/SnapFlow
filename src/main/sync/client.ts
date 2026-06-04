// HTTP client for the backend sync endpoints. Talks to the same modular-monolith
// backend as the AI proxy (architecture §5.3).
import type { SyncRecord } from '../../shared/types';

export class SyncClient {
  constructor(private baseUrl: string, private token: string) {}
  private headers() { return { 'content-type': 'application/json', authorization: `Bearer ${this.token}` }; }

  async push(records: SyncRecord[]): Promise<{ applied: number; cursor: number }> {
    const res = await fetch(`${this.baseUrl}/v1/sync/push`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ records }) });
    if (!res.ok) throw new Error(`push failed (${res.status})`);
    return res.json() as Promise<{ applied: number; cursor: number }>;
  }

  async pull(workspaceId: string, since: number): Promise<{ records: SyncRecord[]; cursor: number }> {
    const url = `${this.baseUrl}/v1/sync/pull?workspace=${encodeURIComponent(workspaceId)}&since=${since}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`pull failed (${res.status})`);
    return res.json() as Promise<{ records: SyncRecord[]; cursor: number }>;
  }

  async putBlob(captureId: string, png: Buffer): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/sync/blob/${captureId}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify({ base64: png.toString('base64') }) });
    if (!res.ok) throw new Error(`blob upload failed (${res.status})`);
  }

  async getBlob(captureId: string): Promise<Buffer | null> {
    const res = await fetch(`${this.baseUrl}/v1/sync/blob/${captureId}`, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`blob download failed (${res.status})`);
    const json = (await res.json()) as { base64?: string };
    return json.base64 ? Buffer.from(json.base64, 'base64') : null;
  }
}
