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
  tx<T>(fn: (db: Db) => Promise<T>, opts?: { immediate?: boolean }): Promise<T>;
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

CREATE TABLE IF NOT EXISTS auth_sessions (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  refresh_hash  TEXT NOT NULL UNIQUE,
  created_at    ${intType} NOT NULL,
  expires_at    ${intType} NOT NULL,
  revoked_at    ${intType},
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_account ON auth_sessions(account_id);

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
  storage_key TEXT NOT NULL,
  updated_at  ${intType} NOT NULL,
  revoked_at  ${intType},
  PRIMARY KEY (account_id, capture_id)
);

CREATE TABLE IF NOT EXISTS oauth_state (
  state      TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  data_json  TEXT NOT NULL DEFAULT '{}',
  created_at ${intType} NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  workspace_id TEXT NOT NULL UNIQUE,
  owner_id     TEXT NOT NULL,
  seat_limit   ${intType} NOT NULL DEFAULT 5,
  created_at   ${intType} NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id);

CREATE TABLE IF NOT EXISTS team_members (
  team_id     TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  role        TEXT NOT NULL,
  joined_at   ${intType} NOT NULL,
  PRIMARY KEY (team_id, account_id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_account ON team_members(account_id);

CREATE TABLE IF NOT EXISTS team_invites (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  ${intType} NOT NULL,
  used_at     ${intType},
  created_by  TEXT NOT NULL,
  created_at  ${intType} NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id);

CREATE TABLE IF NOT EXISTS team_library (
  team_id            TEXT NOT NULL,
  capture_id         TEXT NOT NULL,
  owner_account_id   TEXT NOT NULL,
  shared_by          TEXT NOT NULL,
  filename           TEXT NOT NULL,
  tag                TEXT,
  ocr_text           TEXT NOT NULL DEFAULT '',
  has_pii            ${intType} NOT NULL DEFAULT 0,
  created_at         ${intType} NOT NULL,
  updated_at         ${intType} NOT NULL,
  PRIMARY KEY (team_id, capture_id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_team_library_team ON team_library(team_id, updated_at DESC);
`;
}
