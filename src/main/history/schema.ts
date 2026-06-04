// Database schema. This is the foundation of the "core IP" history engine.
// Verified against SQLite FTS5 (better-sqlite3 bundles SQLite with FTS5 enabled).
//
// Two invariants the architecture says must be right from v1.0 (§12):
//  1. Multi-tenancy: every row carries workspace_id; isolation enforced at query layer.
//  2. The OCR/history engine is cleanly separable from the UI shell.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS captures (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  filename     TEXT NOT NULL,
  image_path   TEXT NOT NULL,
  tag          TEXT,
  ocr_text     TEXT NOT NULL DEFAULT '',
  has_pii      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  -- sync metadata (cloud sync, architecture §6): metadata-first, last-write-wins, tombstones
  updated_at   INTEGER NOT NULL DEFAULT 0,
  deleted      INTEGER NOT NULL DEFAULT 0,
  dirty        INTEGER NOT NULL DEFAULT 0   -- 1 = has local changes awaiting push
);
CREATE INDEX IF NOT EXISTS idx_captures_ws_time ON captures(workspace_id, created_at DESC);

-- Full-text index over filename + OCR text + tag. External-content table
-- mirrors the captures table and is kept in sync by triggers below.
CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
  filename, ocr_text, tag,
  content='captures', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS captures_ai AFTER INSERT ON captures BEGIN
  INSERT INTO captures_fts(rowid, filename, ocr_text, tag)
  VALUES (new.rowid, new.filename, new.ocr_text, new.tag);
END;
CREATE TRIGGER IF NOT EXISTS captures_ad AFTER DELETE ON captures BEGIN
  INSERT INTO captures_fts(captures_fts, rowid, filename, ocr_text, tag)
  VALUES('delete', old.rowid, old.filename, old.ocr_text, old.tag);
END;
CREATE TRIGGER IF NOT EXISTS captures_au AFTER UPDATE ON captures BEGIN
  INSERT INTO captures_fts(captures_fts, rowid, filename, ocr_text, tag)
  VALUES('delete', old.rowid, old.filename, old.ocr_text, old.tag);
  INSERT INTO captures_fts(rowid, filename, ocr_text, tag)
  VALUES (new.rowid, new.filename, new.ocr_text, new.tag);
END;

CREATE TABLE IF NOT EXISTS presets (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  destination  TEXT NOT NULL,
  name         TEXT NOT NULL,
  target       TEXT NOT NULL,
  config       TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presets_ws ON presets(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind         TEXT NOT NULL,
  text         TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ws_time ON events(workspace_id, created_at DESC);
`;

// Per-workspace sync cursor (the highest server sequence number we've pulled).
export const SYNC_SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_state (
  workspace_id TEXT PRIMARY KEY,
  cursor       INTEGER NOT NULL DEFAULT 0
);
`;
