// Sync agent: metadata-first, last-write-wins, lazy blobs (architecture §6).
// Push local changes, pull remote changes, then fetch any missing image blobs.
// Cloud sync is gated on the cloudSync entitlement; Free/Perpetual skip silently.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { imagesDir } from '../paths';
import { SyncClient } from './client';
import type { Engine } from '../engine';
import type { SyncResult } from '../../shared/types';

export class SyncAgent {
  private running = false;
  constructor(private engine: Engine, private client: SyncClient | null) {}

  async run(): Promise<SyncResult> {
    const { history, ent, workspace: WS } = this.engine;
    if (!ent().cloudSync) return { skipped: true };       // tier without cloud sync
    if (!this.client) return { error: 'Cloud sync not configured' };
    if (this.running) return { skipped: true };
    this.running = true;
    try {
      // 1) Push local changes (metadata), then upload blobs for new captures.
      const dirty = history.dirty(WS, 200);
      if (dirty.length) {
        await this.client.push(dirty);
        for (const r of dirty) {
          if (r.deleted) continue;
          const cap = history.get(WS, r.id);
          if (cap?.imagePath && existsSync(cap.imagePath)) {
            try { await this.client.putBlob(r.id, readFileSync(cap.imagePath)); } catch { /* retry next run */ }
          }
        }
        history.markClean(dirty.map(r => r.id));
      }

      // 2) Pull remote changes since our cursor and reconcile (LWW). Our own
      //    just-pushed rows may echo back; the LWW guard makes that a no-op.
      const since = history.getCursor(WS);
      const { records, cursor } = await this.client.pull(WS, since);
      for (const r of records) history.upsertRemote(r);
      history.setCursor(WS, Math.max(since, cursor));

      // 3) Lazily fetch images we now have metadata for but no local file.
      for (const id of history.missingImages(WS, 50)) {
        try {
          const png = await this.client.getBlob(id);
          if (png) { const p = join(imagesDir(), `${id}.png`); writeFileSync(p, png); history.setImagePath(id, p); }
        } catch { /* try next run */ }
      }

      return { pushed: dirty.length, pulled: records.length };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sync failed' };
    } finally {
      this.running = false;
    }
  }
}

export function createSyncAgent(engine: Engine): SyncAgent {
  const base = process.env.SNAPFLOW_CLOUD_URL || process.env.SNAPFLOW_AI_PROXY_URL;
  const token = process.env.SNAPFLOW_API_TOKEN;
  const client = base && token ? new SyncClient(base, token) : null;
  return new SyncAgent(engine, client);
}
