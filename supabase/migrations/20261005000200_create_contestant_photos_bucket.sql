-- Contestant photos are publicly readable on the voting page, while uploads
-- and cleanup are limited to signed-in users of the admin application.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contestant-photos',
  'contestant-photos',
  true,
  1048576,
  ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload contestant photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contestant-photos');

CREATE POLICY "Authenticated users can read contestant photo objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'contestant-photos');

CREATE POLICY "Authenticated users can remove contestant photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'contestant-photos');
