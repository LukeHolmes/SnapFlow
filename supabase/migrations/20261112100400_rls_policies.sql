-- Row Level Security — org-scoped access by membership role (pilot)

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.organisation_id = p_org
        AND m.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_org uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.organisation_id = p_org
        AND m.user_id = auth.uid()
        AND m.role = ANY(p_roles)
    );
$$;

GRANT EXECUTE ON FUNCTION is_org_member(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION has_org_role(uuid, text[]) TO authenticated, anon, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'organisations', 'memberships', 'projects', 'test_protocols', 'test_steps',
    'change_records', 'evidence_items', 'evidence_versions', 'evidence_packs',
    'evidence_pack_items', 'signatures', 'audit_log'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;

-- organisations
CREATE POLICY organisations_select ON organisations
  FOR SELECT TO authenticated
  USING (is_org_member(id));

CREATE POLICY organisations_update ON organisations
  FOR UPDATE TO authenticated
  USING (has_org_role(id, ARRAY['admin']))
  WITH CHECK (has_org_role(id, ARRAY['admin']));

-- memberships
CREATE POLICY memberships_select ON memberships
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY memberships_admin_write ON memberships
  FOR ALL TO authenticated
  USING (has_org_role(organisation_id, ARRAY['admin']))
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin']));

-- Shared read for validation hierarchy
CREATE POLICY projects_org_read ON projects
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY projects_org_write ON projects
  FOR INSERT TO authenticated
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester']));

CREATE POLICY projects_org_update ON projects
  FOR UPDATE TO authenticated
  USING (has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester']));

CREATE POLICY test_protocols_select ON test_protocols
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY test_protocols_write ON test_protocols
  FOR ALL TO authenticated
  USING (has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester']));

CREATE POLICY test_steps_select ON test_steps
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY test_steps_write ON test_steps
  FOR ALL TO authenticated
  USING (has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester']));

CREATE POLICY change_records_select ON change_records
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY change_records_write ON change_records
  FOR ALL TO authenticated
  USING (has_org_role(organisation_id, ARRAY['admin', 'tester']))
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester']));

-- evidence
CREATE POLICY evidence_items_select ON evidence_items
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY evidence_items_insert ON evidence_items
  FOR INSERT TO authenticated
  WITH CHECK (
    has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer'])
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY evidence_items_update ON evidence_items
  FOR UPDATE TO authenticated
  USING (
    has_org_role(organisation_id, ARRAY['admin', 'tester'])
    AND created_by_user_id = auth.uid()
  )
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester']));

CREATE POLICY evidence_items_delete ON evidence_items
  FOR DELETE TO authenticated
  USING (has_org_role(organisation_id, ARRAY['admin']));

CREATE POLICY evidence_versions_select ON evidence_versions
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY evidence_versions_insert ON evidence_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_org_role(organisation_id, ARRAY['admin', 'tester'])
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY evidence_packs_select ON evidence_packs
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY evidence_packs_write ON evidence_packs
  FOR ALL TO authenticated
  USING (has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver']))
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver']));

CREATE POLICY evidence_pack_items_policy ON evidence_pack_items
  FOR ALL TO authenticated
  USING (is_org_member(organisation_id))
  WITH CHECK (has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer']));

CREATE POLICY signatures_select ON signatures
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id));

CREATE POLICY signatures_insert ON signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    has_org_role(organisation_id, ARRAY['admin', 'tester', 'reviewer', 'qa_approver'])
    AND signed_by_user_id = auth.uid()
  );

CREATE POLICY audit_log_select ON audit_log
  FOR SELECT TO authenticated
  USING (
    is_org_member(organisation_id)
    AND has_org_role(organisation_id, ARRAY['admin', 'reviewer', 'qa_approver'])
  );

-- Inserts via SECURITY DEFINER append_audit_event only (no direct INSERT policy for authenticated).

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated, anon;
