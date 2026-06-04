import Database from 'better-sqlite3';
import type { Db } from './db';
import { buildSchema } from './db';

// SQLite adapter (dev/test, zero external services). better-sqlite3 is synchronous;
// we expose it behind the async Db port. Transactions use manual BEGIN/COMMIT since
// the port's tx callback is async.
export class SqliteDb implements Db {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
  }
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }
  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as never[]));
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    this.db.prepare('BEGIN').run();
    try {
      const result = await fn(this);
      this.db.prepare('COMMIT').run();
      return result;
    } catch (e) {
      this.db.prepare('ROLLBACK').run();
      throw e;
    }
  }
  async init(): Promise<void> {
    this.db.exec(buildSchema('INTEGER'));
  }
  async close(): Promise<void> {
    this.db.close();
  }
}
