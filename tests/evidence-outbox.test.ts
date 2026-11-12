import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/main/db';
import {
  dueOutbox,
  enqueueEvidenceOutbox,
  markOutboxFailure,
  markOutboxSuccess,
  upsertLocalLink,
} from '../src/main/evidence/outbox';
import { isEvidenceCloudSyncOptIn, setEvidenceCloudSyncOptIn } from '../src/main/evidence/prefs';

describe('evidence outbox (local SQLite)', () => {
  it('enqueues idempotently and processes retry schedule', () => {
    const db = openDb(join(mkdtempSync(join(tmpdir(), 'ev-outbox-')), 'snap.db'));
    setEvidenceCloudSyncOptIn(db, true);
    assert.equal(isEvidenceCloudSyncOptIn(db), true);

    const key = 'cap-1:create_item:abc';
    enqueueEvidenceOutbox(db, {
      operation: 'create_item',
      idempotencyKey: key,
      payload: { localCaptureId: 'cap-1' },
      captureId: 'cap-1',
    });
    enqueueEvidenceOutbox(db, {
      operation: 'create_item',
      idempotencyKey: key,
      payload: { localCaptureId: 'cap-1' },
      captureId: 'cap-1',
    });
    const rows = dueOutbox(db);
    assert.equal(rows.length, 1);

    markOutboxFailure(db, rows[0].id, 'network', 0);
    const retry = dueOutbox(db);
    assert.equal(retry.length, 0);

    upsertLocalLink(db, { captureId: 'cap-1', testStepId: 'step-1', organisationId: 'org-1' });
    const link = db
      .prepare(`SELECT test_step_id, organisation_id FROM evidence_local_links WHERE capture_id = ?`)
      .get('cap-1') as { test_step_id: string; organisation_id: string };
    assert.equal(link.test_step_id, 'step-1');
    assert.equal(link.organisation_id, 'org-1');

    markOutboxSuccess(db, rows[0].id);
    assert.equal(dueOutbox(db).length, 0);
    db.close();
  });
});
