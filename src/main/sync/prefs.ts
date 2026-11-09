import type Database from 'better-sqlite3';

const PREF_KEY = 'cloud_sync_enabled';

export function isCloudSyncOptIn(db: Database.Database): boolean {
  const row = db.prepare(`SELECT value FROM app_prefs WHERE key = ?`).get(PREF_KEY) as { value: string } | undefined;
  return row?.value === '1';
}

export function setCloudSyncOptIn(db: Database.Database, enabled: boolean): void {
  db.prepare(`INSERT INTO app_prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(PREF_KEY, enabled ? '1' : '0');
}
