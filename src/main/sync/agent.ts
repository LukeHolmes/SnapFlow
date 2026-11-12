// Sync agent: metadata-first, last-write-wins, lazy blobs (architecture §6).
// Opt-in via app prefs (off by default); tier-gated on cloudSync entitlement.
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { imagesDir } from '../paths';
import { SyncClient } from './client';
import { isCloudSyncOptIn } from './prefs';
import { backendBaseUrl, resolveApiToken } from '../auth/token-store';
import type { Engine } from '../engine';
import type { SyncResult } from '../../shared/types';

export type SyncRunOptions = {
  /** Upload local PNGs for dirty rows (manual sync and delivery-time uploads). */
  uploadBlobs?: boolean;
  /** Upload blobs only for these capture IDs (delivery path). */
  blobIds?: string[];
  /** Use a specific on-disk PNG for blob upload (e.g. delivery-time redacted render). */
  blobImagePaths?: Record<string, string>;
};

const URL_DESTINATIONS = new Set(['notion', 'github', 'jira']);

export class SyncAgent {
  private running = false;
  private events = new EventEmitter();
  constructor(private engine: Engine, private client: SyncClient | null) {}

  optedIn(): boolean {
    return this.engine.ent().cloudSync && isCloudSyncOptIn(this.engine.db) && !!this.client;
  }

  needsBlobForDestination(destination: string): boolean {
    return URL_DESTINATIONS.has(destination);
  }

  async run(options: SyncRunOptions = {}): Promise<SyncResult> {
    const { history, ent, workspace: WS } = this.engine;
    if (!ent().cloudSync) return { skipped: true };
    if (!this.client) return { error: 'Cloud sync not configured' };
    if (!isCloudSyncOptIn(this.engine.db)) return { skipped: true, detail: 'Cloud sync is disabled in settings' };
    if (this.running) return { skipped: true };
    this.running = true;
    const uploadBlobs = options.uploadBlobs ?? false;
    const blobIdSet = options.blobIds?.length ? new Set(options.blobIds) : null;
    try {
      const dirty = history.dirty(WS, 200);
      if (dirty.length) {
        await this.client.push(dirty);
        if (uploadBlobs && !blobIdSet) {
          for (const r of dirty) {
            if (r.deleted) continue;
            const uploaded = await this.uploadCaptureBlob(r.id, options.blobImagePaths?.[r.id]);
            if (uploaded) this.events.emit(`blob:${r.id}`);
          }
        }
        history.markClean(dirty.map(r => r.id));
      }

      if (blobIdSet) {
        for (const id of blobIdSet) {
          const uploaded = await this.uploadCaptureBlob(id, options.blobImagePaths?.[id]);
          if (uploaded) this.events.emit(`blob:${id}`);
        }
      }

      const since = history.getCursor(WS);
      const { records, cursor } = await this.client.pull(WS, since);
      for (const r of records) history.upsertRemote(r);
      history.setCursor(WS, Math.max(since, cursor));

      for (const id of history.missingImages(WS, 50)) {
        try {
          const png = await this.client.getBlob(id);
          if (png) { const p = join(imagesDir(), `${id}.png`); writeFileSync(p, png); history.setImagePath(id, p); }
        } catch { /* retry next run */ }
      }

      return { pushed: dirty.length, pulled: records.length };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sync failed' };
    } finally {
      this.running = false;
    }
  }

  async uploadCaptureBlob(captureId: string, imagePathOverride?: string): Promise<boolean> {
    if (!this.client) return false;
    const { history, workspace: WS } = this.engine;
    const cap = history.get(WS, captureId);
    const path = imagePathOverride ?? cap?.imagePath;
    if (!cap || !path || !existsSync(path)) return false;
    try {
      await this.client.putBlob(captureId, readFileSync(path));
      return true;
    } catch {
      return false;
    }
  }

  async waitForBlobUpload(captureId: string, timeoutMs = 30_000): Promise<boolean> {
    if (!this.client) return false;
    return new Promise(resolve => {
      const event = `blob:${captureId}`;
      const onDone = () => {
        clearTimeout(timer);
        this.events.removeListener(event, onDone);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.events.removeListener(event, onDone);
        resolve(false);
      }, timeoutMs);
      this.events.once(event, onDone);
    });
  }
}

export function createSyncAgent(engine: Engine): SyncAgent {
  const base = backendBaseUrl();
  const token = resolveApiToken();
  const client = base && token ? new SyncClient(base, token) : null;
  return new SyncAgent(engine, client);
}
