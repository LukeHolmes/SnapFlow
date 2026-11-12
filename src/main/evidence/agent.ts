import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Engine } from '../engine';
import { backendConfigured } from '../entitlements';
import { isEvidenceCloudSyncOptIn } from './prefs';
import { apiCreateEvidenceItem, apiUploadRedactedVersion } from './client';
import { dueOutbox, markOutboxFailure, markOutboxSuccess, upsertLocalLink } from './outbox';

export type EvidenceSyncResult = { processed: number; errors: number; skipped?: boolean };

export async function runEvidenceOutbox(engine: Engine): Promise<EvidenceSyncResult> {
  const ent = engine.ent();
  if (!ent.cloudSync || !backendConfigured() || !isEvidenceCloudSyncOptIn(engine.db)) {
    return { processed: 0, errors: 0, skipped: true };
  }
  const rows = dueOutbox(engine.db, 25);
  let processed = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      if (row.operation === 'create_item') {
        const created = await apiCreateEvidenceItem(payload);
        const captureId = String(payload.localCaptureId ?? row.capture_id ?? '');
        if (captureId) {
          upsertLocalLink(engine.db, {
            captureId,
            cloudItemId: created.id,
            organisationId: payload.organisationId ? String(payload.organisationId) : undefined,
            testStepId: payload.testStepId ? String(payload.testStepId) : undefined,
            changeRecordRef: payload.changeRecordId ? String(payload.changeRecordId) : undefined,
          });
        }
      } else if (row.operation === 'upload_version') {
        const itemId = String(payload.itemId);
        await apiUploadRedactedVersion(itemId, payload);
      } else {
        throw new Error(`unknown operation ${row.operation}`);
      }
      markOutboxSuccess(engine.db, row.id);
      processed++;
    } catch (e) {
      markOutboxFailure(engine.db, row.id, e instanceof Error ? e.message : String(e), row.attempts);
      errors++;
    }
  }
  return { processed, errors };
}

export function buildRedactedUploadPayload(input: {
  captureId: string;
  imagePath: string;
  piiRedacted: boolean;
  clientCapturedAt: string;
  itemId: string;
  localOriginalSha256?: string;
}): Record<string, unknown> {
  const bytes = readFileSync(input.imagePath);
  return {
    itemId: input.itemId,
    redactedPngBase64: bytes.toString('base64'),
    piiRedacted: input.piiRedacted,
    includesOcrText: false,
    includesUnredactedOriginal: false,
    clientCapturedAt: input.clientCapturedAt,
    localOriginalSha256: input.localOriginalSha256,
  };
}

export function localOriginalSha256FromPath(imagePath: string): string {
  return createHash('sha256').update(readFileSync(imagePath)).digest('hex');
}
