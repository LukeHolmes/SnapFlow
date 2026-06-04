// Async database port. Stores depend only on this interface, so the engine
// (SQLite for dev/test, Postgres for production) is a single config switch.
export interface Db {
  /** SELECT returning rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** SELECT returning the first row or undefined. */
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** INSERT / UPDATE / DELETE / DDL. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Run fn inside a transaction; rolls back on throw. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Apply the schema (idempotent). */
  init(): Promise<void>;
  close(): Promise<void>;
}

// Schema. `$INT` is replaced per dialect: SQLite has 64-bit INTEGER; Postgres
// needs BIGINT for ms-epoch timestamps and sequence numbers (its INTEGER is 32-bit).
export function buildSchema(intType: string): string {
  return `
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  tier       TEXT NOT NULL DEFAULT 'pro',
  created_at ${intType} NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  account_id  TEXT NOT NULL,
  destination TEXT NOT NULL,
  secret      TEXT NOT NULL,
  updated_at  ${intType} NOT NULL,
  PRIMARY KEY (account_id, destination)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  account_id TEXT PRIMARY KEY,
  count      ${intType} NOT NULL DEFAULT 0,
  updated_at ${intType} NOT NULL
);

CREATE TABLE IF NOT EXISTS synced_captures (
  account_id   TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  id           TEXT NOT NULL,
  filename     TEXT NOT NULL,
  tag          TEXT,
  ocr_text     TEXT NOT NULL DEFAULT '',
  has_pii      ${intType} NOT NULL DEFAULT 0,
  created_at   ${intType} NOT NULL,
  updated_at   ${intType} NOT NULL,
  deleted      ${intType} NOT NULL DEFAULT 0,
  seq          ${intType} NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS idx_synced_pull ON synced_captures(account_id, workspace_id, seq);
CREATE INDEX IF NOT EXISTS idx_synced_search ON synced_captures(workspace_id, deleted);

CREATE TABLE IF NOT EXISTS account_seq (
  account_id TEXT PRIMARY KEY,
  value      ${intType} NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blobs (
  account_id TEXT NOT NULL,
  capture_id TEXT NOT NULL,
  path       TEXT NOT NULL,
  updated_at ${intType} NOT NULL,
  PRIMARY KEY (account_id, capture_id)
);

CREATE TABLE IF NOT EXISTS oauth_state (
  state      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  created_at ${intType} NOT NULL
);
`;
}
