import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../store';
import type { Db } from '../store';
import { config } from '../config';

export interface SyncRecord {
  id: string; workspaceId: string; filename: string; tag: string | null;
  ocrText: string; hasPii: boolean; createdAt: number; updatedAt: number; deleted: boolean;
}

function blobDir(accountId: string): string {
  const dir = join(config.dataDir, 'blobs', accountId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function nextSeq(t: Db, accountId: string): Promise<number> {
  await t.run(
    `INSERT INTO account_seq (account_id, value) VALUES (?, 1)
     ON CONFLICT(account_id) DO UPDATE SET value = account_seq.value + 1`,
    [accountId],
  );
  const r = await t.get<{ value: number }>(`SELECT value FROM account_seq WHERE account_id = ?`, [accountId]);
  return Number(r!.value);
}

function toRecord(r: Record<string, unknown>): SyncRecord {
  return {
    id: r.id as string, workspaceId: r.workspace_id as string, filename: r.filename as string,
    tag: (r.tag as string | null) ?? null, ocrText: (r.ocr_text as string) ?? '', hasPii: !!Number(r.has_pii),
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), deleted: !!Number(r.deleted),
  };
}

export const sync = {
  // Upsert with last-write-wins on the client clock; each applied change gets a fresh server seq.
  async push(accountId: string, records: SyncRecord[]): Promise<{ applied: number; cursor: number }> {
    let applied = 0;
    await db().tx(async t => {
      for (const r of records) {
        const existing = await t.get<{ updated_at: number }>(`SELECT updated_at FROM synced_captures WHERE account_id = ? AND id = ?`, [accountId, r.id]);
        if (existing && r.updatedAt <= Number(existing.updated_at)) continue; // older/equal → ignore
        const seq = await nextSeq(t, accountId);
        await t.run(
          `INSERT INTO synced_captures (account_id, workspace_id, id, filename, tag, ocr_text, has_pii, created_at, updated_at, deleted, seq)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(account_id, id) DO UPDATE SET
             workspace_id=excluded.workspace_id, filename=excluded.filename, tag=excluded.tag,
             ocr_text=excluded.ocr_text, has_pii=excluded.has_pii, updated_at=excluded.updated_at,
             deleted=excluded.deleted, seq=excluded.seq`,
          [accountId, r.workspaceId, r.id, r.filename, r.tag, r.ocrText, r.hasPii ? 1 : 0, r.createdAt, r.updatedAt, r.deleted ? 1 : 0, seq],
        );
        applied++;
      }
    });
    const r = await db().get<{ value: number }>(`SELECT value FROM account_seq WHERE account_id = ?`, [accountId]);
    return { applied, cursor: r ? Number(r.value) : 0 };
  },

  async pull(accountId: string, workspaceId: string, since: number, limit = 500): Promise<{ records: SyncRecord[]; cursor: number }> {
    const rows = await db().query(
      `SELECT * FROM synced_captures WHERE account_id = ? AND workspace_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
      [accountId, workspaceId, since, limit],
    );
    const records = rows.map(toRecord);
    const cursor = rows.length ? Number(rows[rows.length - 1].seq) : since;
    return { records, cursor };
  },

  // Server-side full-text-ish search across a workspace's shared library (Team tier).
  // Portable lower(...) LIKE works on both engines; an index on (workspace_id, deleted)
  // narrows the scan. Postgres can later swap this for a tsvector GIN index.
  async searchWorkspace(workspaceId: string, query: string, limit = 50): Promise<SyncRecord[]> {
    const term = `%${query.trim().toLowerCase()}%`;
    if (!query.trim()) return [];
    const rows = await db().query(
      `SELECT * FROM synced_captures
       WHERE workspace_id = ? AND deleted = 0
         AND (lower(filename) LIKE ? OR lower(ocr_text) LIKE ?)
       ORDER BY updated_at DESC LIMIT ?`,
      [workspaceId, term, term, limit],
    );
    return rows.map(toRecord);
  },

  async putBlob(accountId: string, captureId: string, base64: string): Promise<void> {
    const path = join(blobDir(accountId), `${captureId}.png`);
    writeFileSync(path, Buffer.from(base64, 'base64'));
    await db().run(
      `INSERT INTO blobs (account_id, capture_id, path, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(account_id, capture_id) DO UPDATE SET path=excluded.path, updated_at=excluded.updated_at`,
      [accountId, captureId, path, Date.now()],
    );
  },

  async getBlob(accountId: string, captureId: string): Promise<string | null> {
    const row = await db().get<{ path: string }>(`SELECT path FROM blobs WHERE account_id = ? AND capture_id = ?`, [accountId, captureId]);
    if (!row || !existsSync(row.path)) return null;
    return readFileSync(row.path).toString('base64');
  },
};
