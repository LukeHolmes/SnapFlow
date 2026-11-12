// Opens the local SQLite database and applies the schema.
// Deliberately free of any Electron import so the store is unit-testable headless.
import Database from 'better-sqlite3';
import { SCHEMA, SYNC_SCHEMA, COLOR_SCHEMA } from './history/schema';

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  db.exec(SCHEMA);
  db.exec(SYNC_SCHEMA);
  db.exec(COLOR_SCHEMA);
  rebuildFts(db);
  return db;
}

/** Idempotent migrations for databases created before sync columns existed. */
function migrate(db: Db): void {
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'captures'`).get();
  if (!table) return;
  const cols = (db.prepare(`PRAGMA table_info(captures)`).all() as { name: string }[]).map(c => c.name);
  if (!cols.includes('updated_at')) db.exec(`ALTER TABLE captures ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`);
  if (!cols.includes('deleted'))    db.exec(`ALTER TABLE captures ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`);
  if (!cols.includes('dirty'))      db.exec(`ALTER TABLE captures ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0`);
  if (!cols.includes('kind'))       db.exec(`ALTER TABLE captures ADD COLUMN kind TEXT NOT NULL DEFAULT 'screenshot'`);
  if (!cols.includes('media_path')) db.exec(`ALTER TABLE captures ADD COLUMN media_path TEXT`);
  if (!cols.includes('duration_ms')) db.exec(`ALTER TABLE captures ADD COLUMN duration_ms INTEGER`);
  if (!cols.includes('byte_size'))  db.exec(`ALTER TABLE captures ADD COLUMN byte_size INTEGER`);
  if (!cols.includes('pii_redacted')) db.exec(`ALTER TABLE captures ADD COLUMN pii_redacted INTEGER NOT NULL DEFAULT 0`);
  db.exec(`UPDATE captures SET updated_at = created_at WHERE updated_at = 0`);
}

function rebuildFts(db: Db): void {
  // External-content FTS tables do not automatically backfill rows that existed
  // before the virtual table/triggers were introduced.
  db.exec(`INSERT INTO captures_fts(captures_fts) VALUES('rebuild')`);
}
