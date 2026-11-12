import pg from 'pg';
import { evidenceConfig } from './config';

let pool: pg.Pool | null = null;

export function getEvidencePool(): pg.Pool | null {
  if (!evidenceConfig.databaseUrl) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: evidenceConfig.databaseUrl,
      max: 8,
      ssl: evidenceConfig.databaseUrl.includes('supabase') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function evidenceQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const p = getEvidencePool();
  if (!p) throw new Error('evidence database not configured');
  return p.query<T>(text, params);
}

export async function closeEvidencePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
