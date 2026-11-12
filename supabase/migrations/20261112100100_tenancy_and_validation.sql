-- Tenancy, validation objects, retention defaults (pilot decisions 12 Nov 2026)

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  legal_hold boolean NOT NULL DEFAULT false,
  retention_policy jsonb NOT NULL DEFAULT '{"mode":"indefinite"}'::jsonb,
  cloud_ai_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN organisations.cloud_ai_enabled IS 'GxP evidence: off by default (no proxy AI on ingest).';

CREATE TABLE memberships (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('tester', 'reviewer', 'qa_approver', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);

CREATE INDEX memberships_user_id_idx ON memberships(user_id);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  legal_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_org_idx ON projects(organisation_id);

CREATE TABLE test_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title text NOT NULL,
  version_label text NOT NULL DEFAULT '1.0',
  gxp_classification text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX test_protocols_org_idx ON test_protocols(organisation_id);

CREATE TABLE test_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES test_protocols(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order > 0),
  title text NOT NULL,
  expected_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (protocol_id, step_order)
);

CREATE INDEX test_steps_org_idx ON test_steps(organisation_id);

CREATE TABLE change_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  external_ref text NOT NULL,
  title text,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX change_records_org_idx ON change_records(organisation_id);
