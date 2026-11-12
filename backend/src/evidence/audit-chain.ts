import { createHash } from 'node:crypto';

export type AuditLogExportRow = {
  id: number | string;
  organisation_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor_user_id: string | null;
  reason: string;
  metadata: Record<string, unknown> | unknown[];
  payload_canonical?: string;
  payload_hash: string;
  prev_hash: string;
  chain_hash: string;
};

const GENESIS = '0'.repeat(64);

/** Must match Postgres `audit_payload_canonical` / `json_build_object` key order. */
export function auditPayloadCanonical(row: {
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor_user_id: string | null;
  reason: string;
  metadata: unknown;
}): string {
  const payload = {
    event_type: row.event_type,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    actor_user_id: row.actor_user_id,
    reason: row.reason,
    metadata: row.metadata ?? {},
  };
  return JSON.stringify(payload).replace(/":/g, '" : ').replace(/,/g, ', ');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function computeAuditChainFields(
  prevHash: string,
  canonical: string,
): { payload_hash: string; chain_hash: string } {
  const payload_hash = sha256Hex(canonical);
  const chain_hash = sha256Hex(`${prevHash}${canonical}`);
  return { payload_hash, chain_hash };
}

export type AuditVerifyResult =
  | { ok: true }
  | { ok: false; audit_id: number | string; detail: string };

export function verifyExportedAuditChain(rows: AuditLogExportRow[]): AuditVerifyResult[] {
  const sorted = [...rows].sort(
    (a, b) => Number(a.id) - Number(b.id),
  );
  let expectedPrev = GENESIS;
  const results: AuditVerifyResult[] = [];

  for (const row of sorted) {
    if (row.prev_hash !== expectedPrev) {
      results.push({ ok: false, audit_id: row.id, detail: 'prev_hash mismatch' });
      return results;
    }
    const canonical =
      row.payload_canonical ??
      auditPayloadCanonical({
        event_type: row.event_type,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        actor_user_id: row.actor_user_id,
        reason: row.reason,
        metadata: row.metadata as Record<string, unknown>,
      });
    const { payload_hash, chain_hash } = computeAuditChainFields(row.prev_hash, canonical);
    if (row.payload_hash !== payload_hash) {
      results.push({ ok: false, audit_id: row.id, detail: 'payload_hash mismatch' });
      return results;
    }
    if (row.chain_hash !== chain_hash) {
      results.push({ ok: false, audit_id: row.id, detail: 'chain_hash mismatch' });
      return results;
    }
    results.push({ ok: true });
    expectedPrev = row.chain_hash;
  }

  return results;
}

export function manifestHashFromCanonical(canonicalJson: string): string {
  return sha256Hex(canonicalJson);
}
