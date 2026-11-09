import { db } from '../store';
import type { Db } from '../store';
import { blobKey, blobStorage } from '../storage';

export interface SyncRecord {
  id: string; workspaceId: string; filename: string; tag: string | null;
  ocrText: string; hasPii: boolean; createdAt: number; updatedAt: number; deleted: boolean;
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

type BlobRow = { storage_key: string; revoked_at: number | null };

async function blobRow(accountId: string, captureId: string): Promise<BlobRow | undefined> {
  return db().get<BlobRow>(
    `SELECT storage_key, revoked_at FROM blobs WHERE account_id = ? AND capture_id = ?`,
    [accountId, captureId],
  );
}

export const sync = {
  async push(accountId: string, records: SyncRecord[]): Promise<{ applied: number; cursor: number }> {
    let applied = 0;
    await db().tx(async t => {
      for (const r of records) {
        const existing = await t.get<{ updated_at: number }>(`SELECT updated_at FROM synced_captures WHERE account_id = ? AND id = ?`, [accountId, r.id]);
        if (existing && r.updatedAt <= Number(existing.updated_at)) continue;
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
    const key = blobKey(accountId, captureId);
    const bytes = Buffer.from(base64, 'base64');
    await blobStorage().put(key, bytes);
    await db().run(
      `INSERT INTO blobs (account_id, capture_id, storage_key, updated_at, revoked_at) VALUES (?,?,?,?,NULL)
       ON CONFLICT(account_id, capture_id) DO UPDATE SET
         storage_key=excluded.storage_key, updated_at=excluded.updated_at, revoked_at=NULL`,
      [accountId, captureId, key, Date.now()],
    );
  },

  async getBlob(accountId: string, captureId: string): Promise<string | null> {
    const row = await blobRow(accountId, captureId);
    if (!row || row.revoked_at) return null;
    const data = await blobStorage().get(row.storage_key);
    return data ? data.toString('base64') : null;
  },

  async revokeBlob(accountId: string, captureId: string): Promise<boolean> {
    const row = await blobRow(accountId, captureId);
    if (!row || row.revoked_at) return false;
    await blobStorage().delete(row.storage_key);
    await db().run(
      `UPDATE blobs SET revoked_at = ?, updated_at = ? WHERE account_id = ? AND capture_id = ?`,
      [Date.now(), Date.now(), accountId, captureId],
    );
    return true;
  },

  async blobAvailable(accountId: string, captureId: string): Promise<boolean> {
    const row = await blobRow(accountId, captureId);
    if (!row || row.revoked_at) return false;
    return blobStorage().exists(row.storage_key);
  },

  /** @deprecated Prefer blobAvailable + storage get for streaming. */
  async getBlobPath(accountId: string, captureId: string): Promise<string | null> {
    const row = await blobRow(accountId, captureId);
    if (!row || row.revoked_at) return null;
    return blobStorage().localPath(row.storage_key);
  },

  async readBlobBytes(accountId: string, captureId: string): Promise<Buffer | null> {
    const row = await blobRow(accountId, captureId);
    if (!row || row.revoked_at) return null;
    return blobStorage().get(row.storage_key);
  },
};
