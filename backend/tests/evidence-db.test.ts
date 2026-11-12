import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { applyEvidenceMigrations } from '../scripts/apply-evidence-migrations.ts';
import { auditPayloadCanonical, verifyExportedAuditChain } from '../src/evidence/audit-chain.ts';

const databaseUrl =
  process.env.EVIDENCE_DATABASE_URL ??
  'postgres://snapflow:snapflow@127.0.0.1:5432/snapflow_evidence_test';

let client: pg.Client;
let dbReady = false;

async function waitForPostgres(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const probe = new pg.Client({ connectionString: databaseUrl });
    try {
      await probe.connect();
      await probe.query('SELECT 1');
      await probe.end();
      return;
    } catch {
      await probe.end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Postgres not reachable at ${databaseUrl}`);
}

async function asUser(userId: string, fn: (c: pg.Client) => Promise<void>): Promise<void> {
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  await c.query('BEGIN');
  try {
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await fn(c);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

before(async () => {
  try {
    await waitForPostgres();
    const bootstrap = new pg.Client({ connectionString: databaseUrl });
    await bootstrap.connect();
    await bootstrap.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await bootstrap.query('DROP SCHEMA IF EXISTS storage CASCADE');
    await bootstrap.query('DROP SCHEMA public CASCADE');
    await bootstrap.query('CREATE SCHEMA public');
    await bootstrap.query('GRANT ALL ON SCHEMA public TO PUBLIC');
    await bootstrap.end();
    await applyEvidenceMigrations(databaseUrl);
    client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    dbReady = true;
  } catch (err) {
    console.warn('Skipping evidence-db tests:', err);
    dbReady = false;
  }
});

after(async () => {
  if (client) await client.end();
});

describe('GxP evidence database (migrations)', { skip: !process.env.EVIDENCE_DATABASE_URL && !process.env.CI ? 'set EVIDENCE_DATABASE_URL' : false }, () => {
  it('verifies audit chain and detects tampering', async (t) => {
    if (!dbReady) return t.skip('database not available');

    const orgId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const entityId = '33333333-3333-4333-8333-333333333333';

    await client.query('DELETE FROM audit_log WHERE organisation_id = $1', [orgId]);
    await client.query('DELETE FROM memberships WHERE organisation_id = $1', [orgId]);
    await client.query('DELETE FROM organisations WHERE id = $1', [orgId]);
    await client.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    await client.query(
      `INSERT INTO organisations (id, name, slug) VALUES ($1, 'Audit Org', 'audit-org')`,
      [orgId],
    );
    await client.query(
      `INSERT INTO memberships (organisation_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [orgId, userId],
    );

    await client.query(`SELECT append_audit_event($1, 'evidence.created', 'evidence_item', $2, $3, 'seed', '{}'::jsonb)`, [
      orgId,
      entityId,
      userId,
    ]);
    await client.query(`SELECT append_audit_event($1, 'version.ingested', 'evidence_version', $2, $3, 'ingest', '{"kind":"redacted"}'::jsonb)`, [
      orgId,
      entityId,
      userId,
    ]);

    const okRows = await client.query(`SELECT * FROM verify_audit_chain($1) WHERE NOT ok`, [orgId]);
    assert.equal(okRows.rowCount, 0);

    await client.query(`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_mutation`);
    await client.query(`UPDATE audit_log SET chain_hash = $1 WHERE organisation_id = $2`, [
      'f'.repeat(64),
      orgId,
    ]);
    await client.query(`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_mutation`);

    const bad = await client.query(`SELECT * FROM verify_audit_chain($1) WHERE NOT ok`, [orgId]);
    assert.ok((bad.rowCount ?? 0) > 0);

    const sample = await client.query(
      `SELECT event_type, entity_type, entity_id::text AS entity_id, actor_user_id::text AS actor_user_id,
              reason, metadata,
              audit_payload_canonical(event_type, entity_type, entity_id, actor_user_id, reason, metadata) AS canonical
       FROM audit_log WHERE organisation_id = $1 ORDER BY id LIMIT 1`,
      [orgId],
    );
    const row = sample.rows[0];
    const jsCanonical = auditPayloadCanonical({
      event_type: row.event_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      actor_user_id: row.actor_user_id,
      reason: row.reason,
      metadata: row.metadata,
    });
    assert.equal(
      jsCanonical,
      row.canonical,
      'exported manifest canonical must match Postgres audit_payload_canonical (jsonb spacing)',
    );
  });

  it('blocks UPDATE/DELETE on immutable tables', async (t) => {
    if (!dbReady) return t.skip('database not available');

    await assert.rejects(
      () => client.query(`DELETE FROM audit_log WHERE id = (SELECT min(id) FROM audit_log)`),
      /append-only/i,
    );

    const orgId = '44444444-4444-4444-8444-444444444444';
    const userId = '55555555-5555-4555-8555-555555555555';
    const stepId = '66666666-6666-4666-8666-666666666666';
    const itemId = '77777777-7777-4777-8777-777777777777';
    const versionId = '88888888-8888-4888-8888-888888888888';

    await client.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    await client.query(`INSERT INTO organisations (id, name, slug) VALUES ($1, 'Immut Org', 'immut-org') ON CONFLICT DO NOTHING`, [
      orgId,
    ]);
    await client.query(
      `INSERT INTO memberships (organisation_id, user_id, role) VALUES ($1, $2, 'tester') ON CONFLICT DO NOTHING`,
      [orgId, userId],
    );
    await client.query(
      `INSERT INTO projects (id, organisation_id, name) VALUES ($1, $2, 'P') ON CONFLICT DO NOTHING`,
      ['99999999-9999-4999-8999-999999999999', orgId],
    );
    await client.query(
      `INSERT INTO test_protocols (id, project_id, organisation_id, title, status) VALUES ($1, $2, $3, 'proto', 'published') ON CONFLICT DO NOTHING`,
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999', orgId],
    );
    await client.query(
      `INSERT INTO test_steps (id, protocol_id, organisation_id, step_order, title) VALUES ($1, $2, $3, 1, 'step') ON CONFLICT DO NOTHING`,
      [stepId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', orgId],
    );
    await client.query(
      `INSERT INTO evidence_items (id, organisation_id, local_capture_id, test_step_id, created_by_user_id)
       VALUES ($1, $2, gen_random_uuid(), $3, $4) ON CONFLICT DO NOTHING`,
      [itemId, orgId, stepId, userId],
    );
    await client.query(
      `INSERT INTO evidence_versions (id, evidence_item_id, organisation_id, storage_path, sha256, byte_size, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 100, $6) ON CONFLICT DO NOTHING`,
      [
        versionId,
        itemId,
        orgId,
        `${orgId}/${itemId}/${versionId}_redacted.png`,
        'a'.repeat(64),
        userId,
      ],
    );

    await assert.rejects(
      () => client.query(`UPDATE evidence_versions SET sha256 = $1 WHERE id = $2`, ['b'.repeat(64), versionId]),
      /append-only/i,
    );
    await assert.rejects(
      () => client.query(`DELETE FROM evidence_versions WHERE id = $1`, [versionId]),
      /append-only/i,
    );
  });

  it('enforces evidence_item_anchor CHECK', async (t) => {
    if (!dbReady) return t.skip('database not available');

    const orgId = '10101010-1010-4010-8010-101010101010';
    const userId = '20202020-2020-4020-8020-202020202020';

    await client.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    await client.query(`INSERT INTO organisations (id, name, slug) VALUES ($1, 'Anchor Org', 'anchor-org') ON CONFLICT DO NOTHING`, [
      orgId,
    ]);

    await assert.rejects(
      () =>
        client.query(
          `INSERT INTO evidence_items (organisation_id, local_capture_id, created_by_user_id)
           VALUES ($1, gen_random_uuid(), $2)`,
          [orgId, userId],
        ),
      /evidence_item_anchor/i,
    );
  });

  it('blocks delete under legal hold', async (t) => {
    if (!dbReady) return t.skip('database not available');

    const orgId = '30303030-3030-4030-8030-303030303030';
    const userId = '40404040-4040-4040-8040-404040404040';
    const stepId = '50505050-5050-4050-8050-505050505050';
    const itemId = '60606060-6060-4060-8060-606060606060';

    await client.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    await client.query(`INSERT INTO organisations (id, name, slug, legal_hold) VALUES ($1, 'Hold Org', 'hold-org', true) ON CONFLICT DO NOTHING`, [
      orgId,
    ]);
    await client.query(
      `INSERT INTO memberships (organisation_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [orgId, userId],
    );
    await client.query(
      `INSERT INTO projects (id, organisation_id, name) VALUES ($1, $2, 'P2') ON CONFLICT DO NOTHING`,
      ['70707070-7070-4070-8070-707070707070', orgId],
    );
    await client.query(
      `INSERT INTO test_protocols (id, project_id, organisation_id, title, status) VALUES ($1, $2, $3, 'proto', 'published') ON CONFLICT DO NOTHING`,
      ['80808080-8080-4080-8080-808080808080', '70707070-7070-4070-8070-707070707070', orgId],
    );
    await client.query(
      `INSERT INTO test_steps (id, protocol_id, organisation_id, step_order, title) VALUES ($1, $2, $3, 1, 'step') ON CONFLICT DO NOTHING`,
      [stepId, '80808080-8080-4080-8080-808080808080', orgId],
    );
    await client.query(
      `INSERT INTO evidence_items (id, organisation_id, local_capture_id, test_step_id, created_by_user_id)
       VALUES ($1, $2, gen_random_uuid(), $3, $4) ON CONFLICT DO NOTHING`,
      [itemId, orgId, stepId, userId],
    );

    await assert.rejects(() => client.query(`DELETE FROM evidence_items WHERE id = $1`, [itemId]), /legal hold/i);
  });

  it('RLS isolates two organisations', async (t) => {
    if (!dbReady) return t.skip('database not available');

    const orgA = 'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0';
    const orgB = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0';
    const userA = 'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0';
    const userB = 'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0';

    for (const [org, slug, user] of [
      [orgA, 'org-a', userA],
      [orgB, 'org-b', userB],
    ] as const) {
      await client.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [user]);
      await client.query(`INSERT INTO organisations (id, name, slug) VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`, [
        org,
        slug,
      ]);
      await client.query(
        `INSERT INTO memberships (organisation_id, user_id, role) VALUES ($1, $2, 'tester') ON CONFLICT DO NOTHING`,
        [org, user],
      );
    }
    const projectA = 'f1111111-1111-4111-8111-111111111111';
    const projectB = 'f2222222-2222-4222-8222-222222222222';
    await client.query(
      `INSERT INTO projects (id, organisation_id, name) VALUES ($1, $2, 'Project A') ON CONFLICT DO NOTHING`,
      [projectA, orgA],
    );
    await client.query(
      `INSERT INTO projects (id, organisation_id, name) VALUES ($1, $2, 'Project B') ON CONFLICT DO NOTHING`,
      [projectB, orgB],
    );

    await asUser(userA, async (c) => {
      const r = await c.query(`SELECT id FROM projects WHERE organisation_id = $1`, [orgA]);
      assert.equal(r.rowCount, 1);
      const rB = await c.query(`SELECT id FROM projects WHERE organisation_id = $1`, [orgB]);
      assert.equal(rB.rowCount, 0);
    });

    await asUser(userB, async (c) => {
      const r = await c.query(`SELECT id FROM projects WHERE organisation_id = $1`, [orgB]);
      assert.equal(r.rowCount, 1);
    });
  });
});
