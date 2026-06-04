import pg from 'pg';
import type { Db } from './db';
import { buildSchema } from './db';

// Parse BIGINT (OID 20) as a JS number — our values (ms timestamps, sequence
// numbers) are well within Number.MAX_SAFE_INTEGER, and stores expect numbers.
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));

// Translate the portable `?` placeholders into Postgres `$1, $2, …`.
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Queryable = pg.Pool | pg.PoolClient;

class PgQueries {
  constructor(protected q: Queryable) {}
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.q.query(toPg(sql), params as unknown[]);
    return res.rows as T[];
  }
  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.q.query(toPg(sql), params as unknown[]);
  }
}

// A transaction-scoped Db bound to a single checked-out client.
class PgTxDb extends PgQueries implements Db {
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> { return fn(this); } // already in a tx
  async init(): Promise<void> { /* no-op inside tx */ }
  async close(): Promise<void> { /* pool owns lifecycle */ }
}

export class PostgresDb extends PgQueries implements Db {
  private pool: pg.Pool;
  constructor(connectionString?: string) {
    const pool = new pg.Pool(connectionString ? { connectionString } : {});
    super(pool);
    this.pool = pool;
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new PgTxDb(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async init(): Promise<void> {
    await this.pool.query(buildSchema('BIGINT'));
    await this.pool.query(`ALTER TABLE IF EXISTS oauth_state ADD COLUMN IF NOT EXISTS data_json TEXT NOT NULL DEFAULT '{}'`);
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
