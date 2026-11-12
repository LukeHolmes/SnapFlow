import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export type OutboxRow = {
  id: string;
  idempotency_key: string;
  operation: string;
  payload_json: string;
  capture_id: string | null;
  created_at: number;
  next_attempt_at: number;
  attempts: number;
  last_error: string | null;
};

export function enqueueEvidenceOutbox(
  db: Database.Database,
  input: { operation: string; idempotencyKey: string; payload: unknown; captureId?: string },
): string {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO evidence_outbox (id, idempotency_key, operation, payload_json, capture_id, created_at, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(idempotency_key) DO NOTHING`,
  ).run(
    id,
    input.idempotencyKey,
    input.operation,
    JSON.stringify(input.payload),
    input.captureId ?? null,
    now,
    now,
  );
  return id;
}

export function dueOutbox(db: Database.Database, limit = 20): OutboxRow[] {
  const now = Date.now();
  return db
    .prepare(
      `SELECT id, idempotency_key, operation, payload_json, capture_id, created_at, next_attempt_at, attempts, last_error
       FROM evidence_outbox WHERE next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?`,
    )
    .all(now, limit) as OutboxRow[];
}

export function markOutboxSuccess(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM evidence_outbox WHERE id = ?`).run(id);
}

export function markOutboxFailure(db: Database.Database, id: string, err: string, attempts: number): void {
  const backoffMs = Math.min(60_000 * 2 ** attempts, 3_600_000);
  db.prepare(
    `UPDATE evidence_outbox SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`,
  ).run(attempts + 1, err.slice(0, 500), Date.now() + backoffMs, id);
}

export function upsertLocalLink(
  db: Database.Database,
  link: {
    captureId: string;
    cloudItemId?: string;
    testStepId?: string;
    changeRecordRef?: string;
    organisationId?: string;
    packId?: string;
  },
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO evidence_local_links (capture_id, cloud_item_id, test_step_id, change_record_ref, organisation_id, pack_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(capture_id) DO UPDATE SET
       cloud_item_id = COALESCE(excluded.cloud_item_id, evidence_local_links.cloud_item_id),
       test_step_id = COALESCE(excluded.test_step_id, evidence_local_links.test_step_id),
       change_record_ref = COALESCE(excluded.change_record_ref, evidence_local_links.change_record_ref),
       organisation_id = COALESCE(excluded.organisation_id, evidence_local_links.organisation_id),
       pack_id = COALESCE(excluded.pack_id, evidence_local_links.pack_id),
       updated_at = excluded.updated_at`,
  ).run(
    link.captureId,
    link.cloudItemId ?? null,
    link.testStepId ?? null,
    link.changeRecordRef ?? null,
    link.organisationId ?? null,
    link.packId ?? null,
    now,
  );
}
