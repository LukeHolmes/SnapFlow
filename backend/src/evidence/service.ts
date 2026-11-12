import { randomUUID } from 'node:crypto';
import { evidenceQuery } from './pool';
import { evidenceTestDoubles } from './test-doubles';
import type { EvidenceIdentity } from './identity';
import { assertOrgMembership, roleAtLeast } from './identity';
import { buildManifestBody, hashPackManifest, type PackManifest } from './manifest';
import { buildMinimalEvidencePdf } from './pdf-minimal';
import { createSignedDownloadUrl, evidenceObjectPath, sha256Buffer, uploadEvidencePng } from './storage';

async function audit(
  orgId: string,
  event: string,
  entityType: string,
  entityId: string,
  actor: string,
  reason: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await evidenceQuery(`SELECT snapflow_private.append_audit_event($1, $2, $3, $4::uuid, $5::uuid, $6, $7::jsonb)`, [
    orgId,
    event,
    entityType,
    entityId,
    actor,
    reason,
    JSON.stringify(metadata),
  ]);
}

export async function createEvidenceItem(
  identity: EvidenceIdentity,
  input: {
    organisationId: string;
    localCaptureId: string;
    testStepId?: string;
    changeRecordId?: string;
    title?: string;
    localOriginalSha256?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  if (process.env.EVIDENCE_TEST_MOCK === '1' && evidenceTestDoubles.createEvidenceItem) {
    return evidenceTestDoubles.createEvidenceItem(identity, input);
  }
  await assertOrgMembership(identity, input.organisationId);
  if (!roleAtLeast(identity.role, 'tester')) {
    throw Object.assign(new Error('insufficient role'), { status: 403, code: 'forbidden' });
  }
  if (!input.testStepId && !input.changeRecordId) {
    throw Object.assign(new Error('anchor required'), { status: 400, code: 'anchor_required' });
  }
  const id = randomUUID();
  await evidenceQuery(
    `INSERT INTO public.evidence_items (
      id, organisation_id, local_capture_id, test_step_id, change_record_id,
      local_original_sha256, title, metadata, created_by_user_id
    ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, $7, $8::jsonb, $9::uuid)`,
    [
      id,
      input.organisationId,
      input.localCaptureId,
      input.testStepId ?? null,
      input.changeRecordId ?? null,
      input.localOriginalSha256 ?? null,
      input.title ?? null,
      JSON.stringify(input.metadata ?? {}),
      identity.supabaseUserId,
    ],
  );
  await audit(input.organisationId, 'evidence.created', 'evidence_item', id, identity.supabaseUserId, 'bff create', {
    local_capture_id: input.localCaptureId,
  });
  return { id };
}

export async function ingestRedactedVersion(
  identity: EvidenceIdentity,
  itemId: string,
  input: {
    redactedPng: Buffer;
    clientCapturedAt?: string;
    piiRedacted: boolean;
    includesOcrText?: boolean;
    includesUnredactedOriginal?: boolean;
  },
): Promise<{ versionId: string; sha256: string; recordedAt: string }> {
  if (process.env.EVIDENCE_TEST_MOCK === '1' && evidenceTestDoubles.ingestRedactedVersion) {
    return evidenceTestDoubles.ingestRedactedVersion(identity, itemId, input) as Promise<{
      versionId: string;
      sha256: string;
      recordedAt: string;
    }>;
  }
  if (!input.piiRedacted || input.includesUnredactedOriginal) {
    throw Object.assign(new Error('only redacted images may be uploaded'), { status: 400, code: 'unredacted_rejected' });
  }
  if (input.includesOcrText) {
    throw Object.assign(new Error('OCR text must not be uploaded'), { status: 400, code: 'ocr_rejected' });
  }
  const item = await evidenceQuery<{
    organisation_id: string;
    created_by_user_id: string;
  }>(`SELECT organisation_id, created_by_user_id FROM public.evidence_items WHERE id = $1`, [itemId]);
  const row = item.rows[0];
  if (!row) throw Object.assign(new Error('item not found'), { status: 404, code: 'not_found' });
  await assertOrgMembership(identity, row.organisation_id);
  if (!roleAtLeast(identity.role, 'tester')) {
    throw Object.assign(new Error('insufficient role'), { status: 403, code: 'forbidden' });
  }

  const versionId = randomUUID();
  const sha256 = sha256Buffer(input.redactedPng);
  const storagePath = evidenceObjectPath(row.organisation_id, itemId, versionId);
  await uploadEvidencePng(storagePath, input.redactedPng);

  const ins = await evidenceQuery<{ recorded_at: Date }>(
    `INSERT INTO public.evidence_versions (
      id, evidence_item_id, organisation_id, kind, storage_path, sha256, byte_size,
      client_captured_at, created_by_user_id
    ) VALUES ($1, $2, $3, 'redacted', $4, $5, $6, $7::timestamptz, $8::uuid)
    RETURNING recorded_at`,
  [
    versionId,
    itemId,
    row.organisation_id,
    storagePath,
    sha256,
    input.redactedPng.length,
    input.clientCapturedAt ?? null,
    identity.supabaseUserId,
  ],
  );
  const recordedAt = ins.rows[0].recorded_at.toISOString();
  await audit(row.organisation_id, 'version.ingested', 'evidence_version', versionId, identity.supabaseUserId, 'bff ingest', {
    evidence_item_id: itemId,
    sha256,
  });
  return { versionId, sha256, recordedAt };
}

export async function getItemWithVersions(
  identity: EvidenceIdentity,
  itemId: string,
): Promise<Record<string, unknown> | null> {
  const item = await evidenceQuery(`SELECT * FROM public.evidence_items WHERE id = $1`, [itemId]);
  const row = item.rows[0];
  if (!row) return null;
  await assertOrgMembership(identity, row.organisation_id as string);
  const versions = await evidenceQuery(
    `SELECT id, kind, sha256, byte_size, recorded_at, client_captured_at, storage_path
     FROM public.evidence_versions WHERE evidence_item_id = $1 ORDER BY recorded_at`,
    [itemId],
  );
  return { item: row, versions: versions.rows };
}

export async function createPack(
  identity: EvidenceIdentity,
  input: { organisationId: string; title: string; evidenceItemIds: string[] },
): Promise<{ packId: string; manifestHash: string }> {
  await assertOrgMembership(identity, input.organisationId);
  if (!roleAtLeast(identity.role, 'tester')) {
    throw Object.assign(new Error('insufficient role'), { status: 403, code: 'forbidden' });
  }
  const packId = randomUUID();
  await evidenceQuery(
    `INSERT INTO public.evidence_packs (id, organisation_id, title, created_by_user_id)
     VALUES ($1, $2, $3, $4::uuid)`,
    [packId, input.organisationId, input.title, identity.supabaseUserId],
  );
  for (const eid of input.evidenceItemIds) {
    await evidenceQuery(
      `INSERT INTO public.evidence_pack_items (pack_id, evidence_item_id, organisation_id)
       VALUES ($1, $2, $3)`,
      [packId, eid, input.organisationId],
    );
  }
  const manifest = await assemblePackManifest(packId);
  const manifestHash = hashPackManifest(manifest);
  await evidenceQuery(`UPDATE public.evidence_packs SET manifest_hash = $2 WHERE id = $1`, [packId, manifestHash]);
  await audit(input.organisationId, 'pack.assembled', 'evidence_pack', packId, identity.supabaseUserId, 'bff pack', {
    manifest_hash: manifestHash,
  });
  return { packId, manifestHash };
}

async function assemblePackManifest(packId: string): Promise<PackManifest> {
  const pack = await evidenceQuery<{ id: string; organisation_id: string; title: string }>(
    `SELECT id, organisation_id, title FROM public.evidence_packs WHERE id = $1`,
    [packId],
  );
  const p = pack.rows[0];
  if (!p) throw new Error('pack missing');
  const items = await evidenceQuery<{ evidence_item_id: string }>(
    `SELECT evidence_item_id FROM public.evidence_pack_items WHERE pack_id = $1`,
    [packId],
  );
  const manifestItems = [];
  for (const { evidence_item_id } of items.rows) {
    const itemRow = await evidenceQuery<{ id: string; local_capture_id: string }>(
      `SELECT id, local_capture_id FROM public.evidence_items WHERE id = $1`,
      [evidence_item_id],
    );
    const vers = await evidenceQuery<{
      id: string;
      sha256: string;
      recorded_at: Date;
      storage_path: string;
    }>(
      `SELECT id, sha256, recorded_at, storage_path FROM public.evidence_versions WHERE evidence_item_id = $1`,
      [evidence_item_id],
    );
    manifestItems.push({
      evidence_item_id,
      local_capture_id: itemRow.rows[0]?.local_capture_id ?? '',
      versions: vers.rows.map((v) => ({
        version_id: v.id,
        sha256: v.sha256,
        recorded_at: v.recorded_at.toISOString(),
        storage_path: v.storage_path,
      })),
    });
  }
  const sigs = await evidenceQuery<{
    meaning: string;
    signed_payload_hash: string;
    signed_by_user_id: string;
    signed_at: Date;
  }>(`SELECT meaning, signed_payload_hash, signed_by_user_id, signed_at FROM public.signatures WHERE pack_id = $1`, [
    packId,
  ]);
  return buildManifestBody({
    pack_id: p.id,
    organisation_id: p.organisation_id,
    title: p.title,
    generated_at: new Date().toISOString(),
    items: manifestItems,
    signatures: sigs.rows.map((s) => ({
      meaning: s.meaning,
      signed_payload_hash: s.signed_payload_hash,
      signed_by_user_id: s.signed_by_user_id,
      signed_at: s.signed_at.toISOString(),
    })),
  });
}

export async function signPack(
  identity: EvidenceIdentity,
  packId: string,
  input: { meaning: 'author' | 'reviewer' | 'approver'; reauthConfirmed: boolean },
): Promise<{ signatureId: string; signedPayloadHash: string }> {
  if (process.env.EVIDENCE_TEST_MOCK === '1' && evidenceTestDoubles.signPack) {
    return evidenceTestDoubles.signPack(identity, packId, input) as Promise<{
      signatureId: string;
      signedPayloadHash: string;
    }>;
  }
  if (!input.reauthConfirmed) {
    throw Object.assign(new Error('re-authentication required'), { status: 403, code: 'reauth_required' });
  }
  const pack = await evidenceQuery<{ organisation_id: string; manifest_hash: string | null }>(
    `SELECT organisation_id, manifest_hash FROM public.evidence_packs WHERE id = $1`,
    [packId],
  );
  const p = pack.rows[0];
  if (!p) throw Object.assign(new Error('pack not found'), { status: 404, code: 'not_found' });
  await assertOrgMembership(identity, p.organisation_id);
  const minRole =
    input.meaning === 'author' ? 'tester' : input.meaning === 'reviewer' ? 'reviewer' : 'qa_approver';
  if (!roleAtLeast(identity.role, minRole as EvidenceIdentity['role'])) {
    throw Object.assign(new Error('insufficient role for signature'), { status: 403, code: 'forbidden' });
  }
  let manifestHash = p.manifest_hash;
  if (!manifestHash) {
    manifestHash = hashPackManifest(await assemblePackManifest(packId));
    await evidenceQuery(`UPDATE public.evidence_packs SET manifest_hash = $2 WHERE id = $1`, [packId, manifestHash]);
  }
  const sigId = randomUUID();
  await evidenceQuery(
    `INSERT INTO public.signatures (
      id, organisation_id, pack_id, meaning, signed_payload_hash, signed_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6::uuid)`,
    [sigId, p.organisation_id, packId, input.meaning, manifestHash, identity.supabaseUserId],
  );
  await audit(p.organisation_id, 'signature.applied', 'evidence_pack', packId, identity.supabaseUserId, `sign ${input.meaning}`, {
    signed_payload_hash: manifestHash,
  });
  return { signatureId: sigId, signedPayloadHash: manifestHash };
}

export async function exportPack(
  identity: EvidenceIdentity,
  packId: string,
): Promise<{ manifest: PackManifest; manifestHash: string; pdfBase64: string; signedUrls: Array<{ versionId: string; url: string }> }> {
  const pack = await evidenceQuery<{ organisation_id: string }>(
    `SELECT organisation_id FROM public.evidence_packs WHERE id = $1`,
    [packId],
  );
  const p = pack.rows[0];
  if (!p) throw Object.assign(new Error('pack not found'), { status: 404, code: 'not_found' });
  await assertOrgMembership(identity, p.organisation_id);
  const manifest = await assemblePackManifest(packId);
  const manifestHash = hashPackManifest(manifest);
  const signedUrls: Array<{ versionId: string; url: string }> = [];
  for (const item of manifest.items) {
    for (const v of item.versions) {
      const url = await createSignedDownloadUrl(v.storage_path);
      signedUrls.push({ versionId: v.version_id, url });
      await audit(p.organisation_id, 'export.signed_url', 'evidence_version', v.version_id, identity.supabaseUserId, 'pack export url', {
        pack_id: packId,
        expires_in_sec: 900,
      });
    }
  }
  const pdf = buildMinimalEvidencePdf(manifest.title, [
    `Pack ${manifest.pack_id}`,
    `Manifest hash: ${manifestHash}`,
    `Items: ${manifest.items.length}`,
    ...manifest.signatures.map((s) => `Signature ${s.meaning}: ${s.signed_at}`),
  ]);
  await audit(p.organisation_id, 'pack.exported', 'evidence_pack', packId, identity.supabaseUserId, 'bff export', {
    manifest_hash: manifestHash,
  });
  return { manifest, manifestHash, pdfBase64: pdf.toString('base64'), signedUrls };
}
