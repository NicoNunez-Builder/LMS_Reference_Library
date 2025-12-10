  -- Allow anyone to delete files from the staging_library bucket
  CREATE POLICY "Allow public delete"
  ON storage.objects
  FOR DELETE
  TO public
  USING (bucket_id = 'staging_library');