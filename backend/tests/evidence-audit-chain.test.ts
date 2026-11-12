import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeAuditChainFields,
  manifestHashFromCanonical,
  verifyExportedAuditChain,
} from '../src/evidence/audit-chain.ts';

describe('audit-chain (pure)', () => {
  it('computes chain fields and verifies export excerpt', () => {
    const canonical = '{"event_type" : "evidence.created", "entity_type" : "evidence_item", "entity_id" : "a", "actor_user_id" : "b", "reason" : "seed", "metadata" : {}}';
    const genesis = '0'.repeat(64);
    const first = computeAuditChainFields(genesis, canonical);

    const rows = [
      {
        id: 1,
        organisation_id: 'org',
        event_type: 'evidence.created',
        entity_type: 'evidence_item',
        entity_id: 'a',
        actor_user_id: 'b',
        reason: 'seed',
        metadata: {},
        payload_canonical: canonical,
        payload_hash: first.payload_hash,
        prev_hash: genesis,
        chain_hash: first.chain_hash,
      },
    ];

    assert.equal(verifyExportedAuditChain(rows).every((r) => r.ok), true);
    assert.equal(manifestHashFromCanonical('{"pack":1}'), manifestHashFromCanonical('{"pack":1}'));
  });
});
