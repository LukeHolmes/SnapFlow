/**
 * Apply supabase/migrations to a Postgres database (CI / local only).
 * Hosted Supabase: use Dashboard SQL or `supabase db push` after Luke approval.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function runSql(client: pg.Client, filePath: string, label: string): Promise<void> {
  const sql = fs.readFileSync(filePath, 'utf8');
  try {
    await client.query(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} (${filePath}): ${message}`);
  }
}

export async function applyEvidenceMigrations(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const stubPath = path.join(repoRoot, 'supabase/tests/ci-local-stub.sql');
  await runSql(client, stubPath, 'ci-local-stub');

  const migrationsDir = path.join(repoRoot, 'supabase/migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    await runSql(client, path.join(migrationsDir, file), file);
  }

  await client.end();
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.EVIDENCE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Set EVIDENCE_DATABASE_URL or DATABASE_URL');
    process.exit(1);
  }
  applyEvidenceMigrations(url).then(
    () => {
      console.log('Evidence migrations applied.');
    },
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
