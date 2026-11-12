-- BFF tidy: FK index, lock down trigger/helpers, desktop↔Supabase identity map.

CREATE INDEX IF NOT EXISTS evidence_pack_items_organisation_id_idx
  ON public.evidence_pack_items (organisation_id);

REVOKE EXECUTE ON FUNCTION public.assert_evidence_deletion_allowed() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deny_append_only_mutation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION snapflow_private.sha256_hex(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.assert_evidence_deletion_allowed() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deny_append_only_mutation() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.evidence_bff_identities (
  snapflow_account_id text PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.organisations (id) ON DELETE CASCADE,
  supabase_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('tester', 'reviewer', 'qa_approver', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_bff_identities_org_idx ON public.evidence_bff_identities (organisation_id);

ALTER TABLE public.evidence_bff_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_bff_identities FORCE ROW LEVEL SECURITY;

CREATE POLICY evidence_bff_identities_select ON public.evidence_bff_identities
  FOR SELECT TO authenticated
  USING (
    snapflow_private.is_org_member(organisation_id)
    AND supabase_user_id = (SELECT auth.uid())
  );

-- Writes via service_role BFF only (no INSERT policy for authenticated).
