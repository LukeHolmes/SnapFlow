import type Database from 'better-sqlite3';

const KEY = 'evidence_cloud_sync_enabled';

export function isEvidenceCloudSyncOptIn(db: Database.Database): boolean {
  const row = db.prepare(`SELECT value FROM evidence_sync_prefs WHERE key = ?`).get(KEY) as
    | { value: string }
    | undefined;
  return row?.value === '1';
}

export function setEvidenceCloudSyncOptIn(db: Database.Database, enabled: boolean): void {
  db.prepare(
    `INSERT INTO evidence_sync_prefs (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, enabled ? '1' : '0');
}
