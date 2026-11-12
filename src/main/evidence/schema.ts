/** Local SQLite for GxP evidence cloud sync (opt-in; isolated from product capture sync). */

export const EVIDENCE_SYNC_SCHEMA = `
CREATE TABLE IF NOT EXISTS evidence_sync_prefs (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_outbox (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  operation       TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  capture_id      TEXT,
  created_at      INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_outbox_next ON evidence_outbox(next_attempt_at);

CREATE TABLE IF NOT EXISTS evidence_local_links (
  capture_id        TEXT PRIMARY KEY,
  cloud_item_id     TEXT,
  test_step_id      TEXT,
  change_record_ref TEXT,
  organisation_id   TEXT,
  pack_id           TEXT,
  updated_at        INTEGER NOT NULL
);
`;
