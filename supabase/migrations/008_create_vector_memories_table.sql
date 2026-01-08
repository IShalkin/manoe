-- Create vector_memories table for centralized tracking of Supabase <-> Qdrant relationships
-- This provides a metadata layer for managing vector embeddings across the system
-- Requires: update_updated_at_column() function from migration 001_create_projects_table.sql

-- Ensure the update_updated_at_column function exists (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS vector_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL CHECK (memory_type IN ('character', 'worldbuilding', 'scene', 'research')),
    source_id UUID NOT NULL,
    qdrant_point_id TEXT NOT NULL,
    collection_name TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_provider TEXT NOT NULL,
    embedding_dimension INTEGER,
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_vector_memories_project_id ON vector_memories(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_memories_user_id ON vector_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_vector_memories_source_id ON vector_memories(source_id);
CREATE INDEX IF NOT EXISTS idx_vector_memories_qdrant_point_id ON vector_memories(qdrant_point_id);
CREATE INDEX IF NOT EXISTS idx_vector_memories_memory_type ON vector_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_vector_memories_collection_name ON vector_memories(collection_name);

-- Create unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_vector_memories_unique_source 
    ON vector_memories(source_id, collection_name);

-- Enable Row Level Security
ALTER TABLE vector_memories ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see vector memories for their own projects
CREATE POLICY "Users can view own project vector memories" ON vector_memories
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = vector_memories.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can insert vector memories for their own projects
CREATE POLICY "Users can insert own project vector memories" ON vector_memories
    FOR INSERT WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = vector_memories.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can update vector memories for their own projects
CREATE POLICY "Users can update own project vector memories" ON vector_memories
    FOR UPDATE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = vector_memories.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create policy: Users can delete vector memories for their own projects
CREATE POLICY "Users can delete own project vector memories" ON vector_memories
    FOR DELETE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = vector_memories.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_vector_memories_updated_at ON vector_memories;
CREATE TRIGGER update_vector_memories_updated_at
    BEFORE UPDATE ON vector_memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON vector_memories TO authenticated;

-- Note: Removed GRANT SELECT to anon for security - vector memory metadata
-- should not be accessible to unauthenticated users (Principle of Least Privilege)
