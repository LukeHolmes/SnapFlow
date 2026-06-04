import type { Db } from './db';
import { SqliteDb } from './sqlite';
import { PostgresDb } from './pg';
import { config } from '../config';

// Single switch: DATABASE_URL present → Postgres; otherwise SQLite (dev/test).
let instance: Db | null = null;

export function db(): Db {
  if (!instance) {
    instance = config.databaseUrl ? new PostgresDb(config.databaseUrl) : new SqliteDb(config.dbPath);
  }
  return instance;
}

export async function initDb(): Promise<void> {
  await db().init();
}

// Test helper: drop the singleton (and close it) so a fresh engine can be created.
export async function _resetDb(): Promise<void> {
  if (instance) { await instance.close(); instance = null; }
}

export type { Db };
