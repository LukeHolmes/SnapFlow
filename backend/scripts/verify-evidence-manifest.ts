#!/usr/bin/env node
/**
 * Verify an exported evidence pack manifest: manifest hash + audit chain excerpt.
 * Usage: npx tsx backend/scripts/verify-evidence-manifest.ts path/to/manifest.json
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  manifestHashFromCanonical,
  verifyExportedAuditChain,
  type AuditLogExportRow,
} from '../src/evidence/audit-chain';

type Manifest = {
  manifest_hash?: string;
  manifest?: unknown;
  signatures?: Array<{ signed_payload_hash: string }>;
  audit_log?: AuditLogExportRow[];
};

function canonicalManifestJson(manifest: unknown): string {
  return JSON.stringify(manifest);
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: verify-evidence-manifest.ts <manifest.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  const doc = JSON.parse(raw) as Manifest;
  const body = doc.manifest ?? doc;
  const canonical = canonicalManifestJson(body);
  const computedHash = manifestHashFromCanonical(canonical);

  if (doc.manifest_hash && doc.manifest_hash !== computedHash) {
    console.error('Manifest hash mismatch');
    console.error(`  expected (file): ${doc.manifest_hash}`);
    console.error(`  computed:        ${computedHash}`);
    process.exit(1);
  }

  for (const sig of doc.signatures ?? []) {
    if (sig.signed_payload_hash !== computedHash) {
      console.error('Signature signed_payload_hash does not match manifest hash');
      process.exit(1);
    }
  }

  const auditRows = doc.audit_log ?? [];
  if (auditRows.length > 0) {
    const results = verifyExportedAuditChain(auditRows);
    const bad = results.filter((r) => !r.ok);
    if (bad.length > 0) {
      console.error('Audit chain verification failed:', bad[0]);
      process.exit(1);
    }
  }

  console.log('OK manifest hash', computedHash);
  if (auditRows.length > 0) {
    console.log(`OK audit chain (${auditRows.length} rows)`);
  }
}

main();
