-- Append-only audit_log (hash chain), immutability, legal hold on delete

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  prev_hash char(64) NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  chain_hash char(64) NOT NULL CHECK (chain_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_org_id_idx ON audit_log(organisation_id, id);

CREATE OR REPLACE FUNCTION public.audit_payload_canonical(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_metadata jsonb
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT json_build_object(
    'event_type', p_event_type,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id::text,
    'actor_user_id', p_actor_user_id::text,
    'reason', p_reason,
    'metadata', COALESCE(p_metadata, '{}'::jsonb)
  )::text;
$$;

CREATE OR REPLACE FUNCTION public.append_audit_event(
  p_org uuid,
  p_event text,
  p_entity_type text,
  p_entity_id uuid,
  p_actor uuid,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev char(64);
  v_canonical text;
  v_payload_hash char(64);
  v_chain char(64);
  v_id bigint;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'audit reason is required';
  END IF;

  SELECT chain_hash INTO v_prev
  FROM audit_log
  WHERE organisation_id = p_org
  ORDER BY id DESC
  LIMIT 1;

  IF v_prev IS NULL THEN
    v_prev := repeat('0', 64);
  END IF;

  v_canonical := audit_payload_canonical(
    p_event, p_entity_type, p_entity_id, p_actor, p_reason, p_metadata
  );
  v_payload_hash := encode(digest(v_canonical, 'sha256'), 'hex');
  v_chain := encode(digest(v_prev || v_canonical, 'sha256'), 'hex');

  INSERT INTO audit_log (
    organisation_id, event_type, entity_type, entity_id, actor_user_id, reason,
    metadata, payload_hash, prev_hash, chain_hash
  ) VALUES (
    p_org, p_event, p_entity_type, p_entity_id, p_actor, p_reason,
    COALESCE(p_metadata, '{}'::jsonb), v_payload_hash, v_prev, v_chain
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_org uuid)
RETURNS TABLE (
  audit_id bigint,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  r audit_log%ROWTYPE;
  v_expected_prev char(64) := repeat('0', 64);
  v_canonical text;
  v_payload_hash char(64);
  v_chain char(64);
BEGIN
  FOR r IN
    SELECT * FROM audit_log WHERE organisation_id = p_org ORDER BY id ASC
  LOOP
  audit_id := r.id;
  IF r.prev_hash <> v_expected_prev THEN
    ok := false;
    detail := 'prev_hash mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  v_canonical := audit_payload_canonical(
    r.event_type, r.entity_type, r.entity_id, r.actor_user_id, r.reason, r.metadata
  );
  v_payload_hash := encode(digest(v_canonical, 'sha256'), 'hex');
  IF r.payload_hash <> v_payload_hash THEN
    ok := false;
    detail := 'payload_hash mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  v_chain := encode(digest(r.prev_hash || v_canonical, 'sha256'), 'hex');
  IF r.chain_hash <> v_chain THEN
    ok := false;
    detail := 'chain_hash mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  ok := true;
  detail := 'ok';
  RETURN NEXT;
  v_expected_prev := r.chain_hash;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.deny_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; UPDATE and DELETE are prohibited', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER audit_log_no_mutation
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION deny_append_only_mutation();

CREATE TRIGGER evidence_versions_no_mutation
  BEFORE UPDATE OR DELETE ON evidence_versions
  FOR EACH ROW
  EXECUTE FUNCTION deny_append_only_mutation();

REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON evidence_versions FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assert_evidence_deletion_allowed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  org_hold boolean;
  proj_hold boolean := false;
BEGIN
  SELECT legal_hold INTO org_hold FROM organisations WHERE id = OLD.organisation_id;
  IF org_hold OR OLD.legal_hold THEN
    RAISE EXCEPTION 'legal hold blocks deletion of evidence item %', OLD.id;
  END IF;

  IF OLD.test_step_id IS NOT NULL THEN
    SELECT COALESCE(p.legal_hold, false) INTO proj_hold
    FROM test_steps ts
    JOIN test_protocols tp ON tp.id = ts.protocol_id
    JOIN projects p ON p.id = tp.project_id
  WHERE ts.id = OLD.test_step_id;
  ELSIF OLD.change_record_id IS NOT NULL THEN
    SELECT COALESCE(p.legal_hold, false) INTO proj_hold
    FROM change_records cr
    JOIN projects p ON p.id = cr.project_id
    WHERE cr.id = OLD.change_record_id;
  END IF;

  IF proj_hold THEN
    RAISE EXCEPTION 'project legal hold blocks deletion of evidence item %', OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER evidence_items_legal_hold_delete
  BEFORE DELETE ON evidence_items
  FOR EACH ROW
  EXECUTE FUNCTION assert_evidence_deletion_allowed();

GRANT EXECUTE ON FUNCTION append_audit_event TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_audit_chain TO authenticated, service_role;
