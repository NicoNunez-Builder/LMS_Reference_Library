  -- Add content storage columns to lr_resources
  ALTER TABLE lr_resources
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS content_source TEXT CHECK
  (content_source IN ('scraped', 'parsed', 'manual'));