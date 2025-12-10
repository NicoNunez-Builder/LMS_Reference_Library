  -- Drop existing policy if any
  DROP POLICY IF EXISTS "Anyone can insert public LR_resources" ON
  LR_resources;

  -- Add policy for anonymous inserts of public resources
  CREATE POLICY "Anyone can insert public LR_resources"
    ON LR_resources FOR INSERT
    WITH CHECK (is_public = true AND user_id IS NULL);