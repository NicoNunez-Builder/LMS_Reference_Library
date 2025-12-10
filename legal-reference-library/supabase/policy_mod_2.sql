  -- Allow anonymous uploads to staging_library bucket
  CREATE POLICY "Allow anonymous uploads to
  staging_library"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'staging_library');

  -- Allow anonymous to update objects (for overwrites)
  CREATE POLICY "Allow anonymous updates to
  staging_library"
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'staging_library')
  WITH CHECK (bucket_id = 'staging_library');

  -- Allow public read access to staging_library
  CREATE POLICY "Allow public read from
  staging_library"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'staging_library');

  -- Allow anonymous delete (we added this earlier, but including for completeness)
  CREATE POLICY "Allow anonymous delete from
  staging_library"
  ON storage.objects
  FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'staging_library');

  --If you get errors about policies already existing, you can check/drop existing ones first:

  -- Check existing policies
  SELECT * FROM pg_policies WHERE tablename =
  'objects' AND schemaname = 'storage';

  -- Drop if needed (replace with actual policy name)    
  -- DROP POLICY "policy_name" ON storage.objects;      