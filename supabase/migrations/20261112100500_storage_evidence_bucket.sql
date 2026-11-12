-- Private evidence bucket (redacted PNGs only); path: {org_id}/{item_id}/{version_id}_*

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY evidence_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND cardinality(storage.foldername(name)) >= 1
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY evidence_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND cardinality(storage.foldername(name)) >= 3
    AND public.has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin', 'tester'])
    AND (storage.foldername(name))[3] LIKE '%\_%'
  );

CREATE POLICY evidence_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND public.has_org_role((storage.foldername(name))[1]::uuid, ARRAY['admin'])
  );
