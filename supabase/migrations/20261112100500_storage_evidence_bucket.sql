-- Private evidence bucket (redacted PNGs only); path: {org_id}/{item_id}/{version_id}_*
-- On hosted Supabase, storage.objects RLS is already enabled (do not ALTER).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS evidence_objects_select ON storage.objects;
CREATE POLICY evidence_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND cardinality(storage.foldername(name)) >= 1
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS evidence_objects_insert ON storage.objects;
CREATE POLICY evidence_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND cardinality(storage.foldername(name)) >= 3
    AND public.has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin', 'tester'])
    AND (storage.foldername(name))[3] LIKE '%\_%'
  );

DROP POLICY IF EXISTS evidence_objects_delete ON storage.objects;
CREATE POLICY evidence_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
  );
