-- Supabase advisor hardening: private definer helpers, search_path, grants, RLS policy cleanup, FK indexes.

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE SCHEMA snapflow_private;
REVOKE ALL ON SCHEMA snapflow_private FROM PUBLIC;
GRANT USAGE ON SCHEMA snapflow_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION snapflow_private.sha256_hex(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
BEGIN
  BEGIN
    RETURN encode(extensions.digest(p_input, 'sha256'), 'hex');
  EXCEPTION
    WHEN undefined_function THEN
      RETURN encode(public.digest(p_input, 'sha256'), 'hex');
  END;
END;
$$;

CREATE OR REPLACE FUNCTION snapflow_private.audit_payload_canonical(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_metadata jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
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

CREATE OR REPLACE FUNCTION snapflow_private.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organisation_id = p_org
        AND m.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION snapflow_private.has_org_role(p_org uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.organisation_id = p_org
        AND m.user_id = auth.uid()
        AND m.role = ANY (p_roles)
    );
$$;

CREATE OR REPLACE FUNCTION snapflow_private.append_audit_event(
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
SET search_path = ''
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
  FROM public.audit_log
  WHERE organisation_id = p_org
  ORDER BY id DESC
  LIMIT 1;

  IF v_prev IS NULL THEN
    v_prev := repeat('0', 64);
  END IF;

  v_canonical := snapflow_private.audit_payload_canonical(
    p_event, p_entity_type, p_entity_id, p_actor, p_reason, p_metadata
  );
  v_payload_hash := snapflow_private.sha256_hex(v_canonical);
  v_chain := snapflow_private.sha256_hex(v_prev || v_canonical);

  INSERT INTO public.audit_log (
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

CREATE OR REPLACE FUNCTION snapflow_private.verify_audit_chain(p_org uuid)
RETURNS TABLE (
  audit_id bigint,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r public.audit_log%ROWTYPE;
  v_expected_prev char(64) := repeat('0', 64);
  v_canonical text;
  v_payload_hash char(64);
  v_chain char(64);
BEGIN
  FOR r IN
    SELECT * FROM public.audit_log WHERE organisation_id = p_org ORDER BY id ASC
  LOOP
    audit_id := r.id;
    IF r.prev_hash <> v_expected_prev THEN
      ok := false;
      detail := 'prev_hash mismatch';
      RETURN NEXT;
      RETURN;
    END IF;

    v_canonical := snapflow_private.audit_payload_canonical(
      r.event_type, r.entity_type, r.entity_id, r.actor_user_id, r.reason, r.metadata
    );
    v_payload_hash := snapflow_private.sha256_hex(v_canonical);
    IF r.payload_hash <> v_payload_hash THEN
      ok := false;
      detail := 'payload_hash mismatch';
      RETURN NEXT;
      RETURN;
    END IF;

    v_chain := snapflow_private.sha256_hex(r.prev_hash || v_canonical);
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
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; UPDATE and DELETE are prohibited', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_evidence_deletion_allowed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  org_hold boolean;
  proj_hold boolean := false;
BEGIN
  SELECT o.legal_hold INTO org_hold FROM public.organisations o WHERE o.id = OLD.organisation_id;
  IF org_hold OR OLD.legal_hold THEN
    RAISE EXCEPTION 'legal hold blocks deletion of evidence item %', OLD.id;
  END IF;

  IF OLD.test_step_id IS NOT NULL THEN
    SELECT COALESCE(p.legal_hold, false) INTO proj_hold
    FROM public.test_steps ts
    JOIN public.test_protocols tp ON tp.id = ts.protocol_id
    JOIN public.projects p ON p.id = tp.project_id
    WHERE ts.id = OLD.test_step_id;
  ELSIF OLD.change_record_id IS NOT NULL THEN
    SELECT COALESCE(p.legal_hold, false) INTO proj_hold
    FROM public.change_records cr
    JOIN public.projects p ON p.id = cr.project_id
    WHERE cr.id = OLD.change_record_id;
  END IF;

  IF proj_hold THEN
    RAISE EXCEPTION 'project legal hold blocks deletion of evidence item %', OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION snapflow_private.audit_payload_canonical(text, text, uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION snapflow_private.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION snapflow_private.has_org_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION snapflow_private.append_audit_event(uuid, text, text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION snapflow_private.verify_audit_chain(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION snapflow_private.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION snapflow_private.has_org_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION snapflow_private.append_audit_event(uuid, text, text, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION snapflow_private.verify_audit_chain(uuid) TO authenticated, service_role;

-- Unindexed foreign keys (pilot tables)
CREATE INDEX IF NOT EXISTS evidence_items_test_step_id_idx ON public.evidence_items(test_step_id);
CREATE INDEX IF NOT EXISTS evidence_items_change_record_id_idx ON public.evidence_items(change_record_id);
CREATE INDEX IF NOT EXISTS evidence_items_created_by_user_id_idx ON public.evidence_items(created_by_user_id);
CREATE INDEX IF NOT EXISTS evidence_versions_created_by_user_id_idx ON public.evidence_versions(created_by_user_id);
CREATE INDEX IF NOT EXISTS evidence_packs_created_by_user_id_idx ON public.evidence_packs(created_by_user_id);
CREATE INDEX IF NOT EXISTS evidence_pack_items_evidence_item_id_idx ON public.evidence_pack_items(evidence_item_id);
CREATE INDEX IF NOT EXISTS signatures_signed_by_user_id_idx ON public.signatures(signed_by_user_id);
CREATE INDEX IF NOT EXISTS test_protocols_project_id_idx ON public.test_protocols(project_id);
CREATE INDEX IF NOT EXISTS test_steps_protocol_id_idx ON public.test_steps(protocol_id);
CREATE INDEX IF NOT EXISTS change_records_project_id_idx ON public.change_records(project_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_user_id_idx ON public.audit_log(actor_user_id);

-- Consolidate duplicate permissive SELECT policies; auth.uid() initplan form on evidence/signature writes.

DROP POLICY IF EXISTS memberships_select ON public.memberships;
DROP POLICY IF EXISTS memberships_admin_write ON public.memberships;
CREATE POLICY memberships_select ON public.memberships
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));
CREATE POLICY memberships_insert ON public.memberships
  FOR INSERT TO authenticated
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin']));
CREATE POLICY memberships_update ON public.memberships
  FOR UPDATE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin']))
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin']));
CREATE POLICY memberships_delete ON public.memberships
  FOR DELETE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin']));

DROP POLICY IF EXISTS change_records_select ON public.change_records;
DROP POLICY IF EXISTS change_records_write ON public.change_records;
CREATE POLICY change_records_select ON public.change_records
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));
CREATE POLICY change_records_insert ON public.change_records
  FOR INSERT TO authenticated
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));
CREATE POLICY change_records_update ON public.change_records
  FOR UPDATE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));
CREATE POLICY change_records_delete ON public.change_records
  FOR DELETE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));

DROP POLICY IF EXISTS test_protocols_select ON public.test_protocols;
DROP POLICY IF EXISTS test_protocols_write ON public.test_protocols;
CREATE POLICY test_protocols_select ON public.test_protocols
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));
CREATE POLICY test_protocols_insert ON public.test_protocols
  FOR INSERT TO authenticated
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));
CREATE POLICY test_protocols_update ON public.test_protocols
  FOR UPDATE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));
CREATE POLICY test_protocols_delete ON public.test_protocols
  FOR DELETE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));

DROP POLICY IF EXISTS test_steps_select ON public.test_steps;
DROP POLICY IF EXISTS test_steps_write ON public.test_steps;
CREATE POLICY test_steps_select ON public.test_steps
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));
CREATE POLICY test_steps_insert ON public.test_steps
  FOR INSERT TO authenticated
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));
CREATE POLICY test_steps_update ON public.test_steps
  FOR UPDATE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));
CREATE POLICY test_steps_delete ON public.test_steps
  FOR DELETE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));

DROP POLICY IF EXISTS evidence_packs_select ON public.evidence_packs;
DROP POLICY IF EXISTS evidence_packs_write ON public.evidence_packs;
CREATE POLICY evidence_packs_select ON public.evidence_packs
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));
CREATE POLICY evidence_packs_insert ON public.evidence_packs
  FOR INSERT TO authenticated
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver']));
CREATE POLICY evidence_packs_update ON public.evidence_packs
  FOR UPDATE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver']))
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver']));
CREATE POLICY evidence_packs_delete ON public.evidence_packs
  FOR DELETE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver']));

DROP POLICY IF EXISTS evidence_items_insert ON public.evidence_items;
DROP POLICY IF EXISTS evidence_items_update ON public.evidence_items;
CREATE POLICY evidence_items_insert ON public.evidence_items
  FOR INSERT TO authenticated
  WITH CHECK (
    snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer'])
    AND created_by_user_id = (SELECT auth.uid())
  );
CREATE POLICY evidence_items_update ON public.evidence_items
  FOR UPDATE TO authenticated
  USING (
    snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester'])
    AND created_by_user_id = (SELECT auth.uid())
  )
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));

DROP POLICY IF EXISTS evidence_versions_insert ON public.evidence_versions;
CREATE POLICY evidence_versions_insert ON public.evidence_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester'])
    AND created_by_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS signatures_insert ON public.signatures;
CREATE POLICY signatures_insert ON public.signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver'])
    AND signed_by_user_id = (SELECT auth.uid())
  );

-- Remaining policies: swap to private helpers
DROP POLICY IF EXISTS organisations_select ON public.organisations;
CREATE POLICY organisations_select ON public.organisations
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(id));

DROP POLICY IF EXISTS organisations_update ON public.organisations;
CREATE POLICY organisations_update ON public.organisations
  FOR UPDATE TO authenticated
  USING (snapflow_private.has_org_role(id, ARRAY['admin']))
  WITH CHECK (snapflow_private.has_org_role(id, ARRAY['admin']));

DROP POLICY IF EXISTS projects_org_read ON public.projects;
CREATE POLICY projects_org_read ON public.projects
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));

DROP POLICY IF EXISTS projects_org_write ON public.projects;
CREATE POLICY projects_org_write ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));

DROP POLICY IF EXISTS projects_org_update ON public.projects;
CREATE POLICY projects_org_update ON public.projects
  FOR UPDATE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester']));

DROP POLICY IF EXISTS evidence_items_select ON public.evidence_items;
CREATE POLICY evidence_items_select ON public.evidence_items
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));

DROP POLICY IF EXISTS evidence_items_delete ON public.evidence_items;
CREATE POLICY evidence_items_delete ON public.evidence_items
  FOR DELETE TO authenticated
  USING (snapflow_private.has_org_role(organisation_id, ARRAY['admin']));

DROP POLICY IF EXISTS evidence_versions_select ON public.evidence_versions;
CREATE POLICY evidence_versions_select ON public.evidence_versions
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));

DROP POLICY IF EXISTS evidence_pack_items_policy ON public.evidence_pack_items;
CREATE POLICY evidence_pack_items_policy ON public.evidence_pack_items
  FOR ALL TO authenticated
  USING (snapflow_private.is_org_member(organisation_id))
  WITH CHECK (snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer']));

DROP POLICY IF EXISTS signatures_select ON public.signatures;
CREATE POLICY signatures_select ON public.signatures
  FOR SELECT TO authenticated
  USING (snapflow_private.is_org_member(organisation_id));

DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    snapflow_private.is_org_member(organisation_id)
    AND snapflow_private.has_org_role(organisation_id, ARRAY['admin', 'reviewer', 'qa_approver'])
  );

DROP POLICY IF EXISTS evidence_objects_select ON storage.objects;
DROP POLICY IF EXISTS evidence_objects_insert ON storage.objects;
DROP POLICY IF EXISTS evidence_objects_delete ON storage.objects;

CREATE POLICY evidence_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND cardinality(storage.foldername(name)) >= 1
    AND snapflow_private.is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY evidence_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND cardinality(storage.foldername(name)) >= 3
    AND snapflow_private.has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin', 'tester'])
    AND (storage.foldername(name))[3] LIKE '%\_%'
  );

CREATE POLICY evidence_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND snapflow_private.has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
  );

DROP FUNCTION IF EXISTS public.append_audit_event(uuid, text, text, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.verify_audit_chain(uuid);
DROP FUNCTION IF EXISTS public.is_org_member(uuid);
DROP FUNCTION IF EXISTS public.has_org_role(uuid, text[]);
DROP FUNCTION IF EXISTS public.audit_payload_canonical(text, text, uuid, uuid, text, jsonb);
