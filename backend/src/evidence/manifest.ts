import { manifestHashFromCanonical } from './audit-chain';

export type PackManifest = {
  pack_id: string;
  organisation_id: string;
  title: string;
  generated_at: string;
  items: Array<{
    evidence_item_id: string;
    local_capture_id: string;
    versions: Array<{
      version_id: string;
      sha256: string;
      recorded_at: string;
      storage_path: string;
    }>;
  }>;
  signatures: Array<{
    meaning: string;
    signed_payload_hash: string;
    signed_by_user_id: string;
    signed_at: string;
  }>;
};

export function buildManifestBody(manifest: Omit<PackManifest, never>): PackManifest {
  return manifest;
}

export function hashPackManifest(manifest: PackManifest): string {
  return manifestHashFromCanonical(JSON.stringify(manifest));
}
