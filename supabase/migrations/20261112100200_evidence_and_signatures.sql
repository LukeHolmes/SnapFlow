-- Evidence artefacts, packs, Part 11 signatures (pilot)

CREATE TABLE evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  local_capture_id uuid NOT NULL,
  test_step_id uuid REFERENCES test_steps(id) ON DELETE RESTRICT,
  change_record_id uuid REFERENCES change_records(id) ON DELETE RESTRICT,
  local_original_sha256 char(64) CHECK (
    local_original_sha256 IS NULL OR local_original_sha256 ~ '^[0-9a-f]{64}$'
  ),
  title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_hold boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_item_anchor CHECK (
    test_step_id IS NOT NULL OR change_record_id IS NOT NULL
  )
);

CREATE INDEX evidence_items_org_idx ON evidence_items(organisation_id);
CREATE UNIQUE INDEX evidence_items_local_capture_idx ON evidence_items(organisation_id, local_capture_id);

CREATE TABLE evidence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE RESTRICT,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'redacted' CHECK (kind = 'redacted'),
  storage_path text NOT NULL,
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  client_captured_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX evidence_versions_item_idx ON evidence_versions(evidence_item_id);
CREATE INDEX evidence_versions_org_idx ON evidence_versions(organisation_id);

CREATE TABLE evidence_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'submitted', 'reviewed', 'approved')
  ),
  manifest_hash char(64) CHECK (
    manifest_hash IS NULL OR manifest_hash ~ '^[0-9a-f]{64}$'
  ),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_packs_org_idx ON evidence_packs(organisation_id);

CREATE TABLE evidence_pack_items (
  pack_id uuid NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items(id) ON DELETE RESTRICT,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, evidence_item_id)
);

CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,
  meaning text NOT NULL CHECK (meaning IN ('author', 'reviewer', 'approver')),
  display_label text,
  signed_payload_hash char(64) NOT NULL CHECK (signed_payload_hash ~ '^[0-9a-f]{64}$'),
  signed_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  signed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signatures_pack_idx ON signatures(pack_id);
CREATE INDEX signatures_org_idx ON signatures(organisation_id);
