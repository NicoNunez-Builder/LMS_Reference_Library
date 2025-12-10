-- =============================================
-- EMBEDDINGS SCHEMA FOR RAG
-- =============================================
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document chunks table with embeddings
CREATE TABLE IF NOT EXISTS lr_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES lr_resources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  token_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(resource_id, chunk_index)
);

-- Index for vector similarity search (using HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_lr_embeddings_vector
  ON lr_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Index for resource lookups
CREATE INDEX IF NOT EXISTS idx_lr_embeddings_resource
  ON lr_embeddings(resource_id);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS lr_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('summarize', 'qa', 'chat')),
  provider TEXT NOT NULL CHECK (provider IN ('pgvector', 'gemini')),
  model TEXT,
  resource_ids UUID[] DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS lr_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES lr_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]', -- Array of source chunks used
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for chat
CREATE INDEX IF NOT EXISTS idx_lr_chat_sessions_user ON lr_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lr_chat_messages_session ON lr_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_lr_chat_messages_created ON lr_chat_messages(created_at);

-- RLS Policies
ALTER TABLE lr_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lr_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lr_chat_messages ENABLE ROW LEVEL SECURITY;

-- Embeddings are readable by everyone (they reference public resources)
CREATE POLICY "lr_embeddings are viewable by everyone"
  ON lr_embeddings FOR SELECT
  USING (true);

-- Anyone can insert embeddings
CREATE POLICY "Anyone can insert lr_embeddings"
  ON lr_embeddings FOR INSERT
  WITH CHECK (true);

-- Chat sessions policy - public sessions are viewable
CREATE POLICY "lr_chat_sessions are viewable by everyone"
  ON lr_chat_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert lr_chat_sessions"
  ON lr_chat_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update lr_chat_sessions"
  ON lr_chat_sessions FOR UPDATE
  USING (true);

-- Chat messages policy
CREATE POLICY "lr_chat_messages are viewable by everyone"
  ON lr_chat_messages FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert lr_chat_messages"
  ON lr_chat_messages FOR INSERT
  WITH CHECK (true);

-- Function to search similar embeddings
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_resource_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  resource_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.resource_id,
    e.chunk_index,
    e.chunk_text,
    1 - (e.embedding <=> query_embedding) AS similarity,
    e.metadata
  FROM lr_embeddings e
  WHERE
    (filter_resource_ids IS NULL OR e.resource_id = ANY(filter_resource_ids))
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
