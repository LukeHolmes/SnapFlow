import type { Db } from '../db';

const PREF_KEY = 'ai_tagging_opt_in';

export function isAiTaggingOptIn(db: Db): boolean {
  const row = db.prepare(`SELECT value FROM app_prefs WHERE key = ?`).get(PREF_KEY) as { value: string } | undefined;
  return row?.value === '1';
}

export function setAiTaggingOptIn(db: Db, enabled: boolean): void {
  db.prepare(`INSERT INTO app_prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(PREF_KEY, enabled ? '1' : '0');
}
