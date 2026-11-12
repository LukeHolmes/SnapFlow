import { config as appConfig } from '../config';

export const evidenceConfig = {
  /** Supabase Postgres connection (service role / direct). */
  databaseUrl: process.env.EVIDENCE_DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? '',
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  storageBucket: process.env.SUPABASE_EVIDENCE_BUCKET ?? 'evidence',
  signedDownloadTtlSec: Number(process.env.EVIDENCE_SIGNED_URL_TTL_SEC ?? 900),
  enabled: Boolean(
    process.env.EVIDENCE_DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  ),
};

export function assertEvidenceBackendConfigured(): void {
  if (!evidenceConfig.databaseUrl) {
    throw new Error('EVIDENCE_DATABASE_URL or SUPABASE_DB_URL is required for evidence routes');
  }
}

/** Dev-only relaxed config for sqlite-backed route tests with mocked pool. */
export function isEvidenceTestMode(): boolean {
  return process.env.EVIDENCE_TEST_MOCK === '1';
}
