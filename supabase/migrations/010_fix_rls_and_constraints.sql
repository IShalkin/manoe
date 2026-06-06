-- Forward migration to fix RLS gaps and missing constraints discovered in audit.
-- This migration is additive and idempotent; it does NOT loosen any existing policy.
--
-- Fixes:
--   1. research_results: scope the "Service role has full access" policy to service_role
--      (previously applied to ALL roles, granting every authenticated user access to
--       everyone's research_results via OR-combined policies).
--   2. characters / worldbuilding: add missing DELETE policies + grants.
--   3. outlines: add missing UPDATE and DELETE policies + grants.
--   4. critiques: add missing UPDATE policy + grant.
--   5. characters: add UNIQUE (project_id, name) required by SupabaseService.upsertCharacters
--      (onConflict: 'project_id,name'); without it upsert silently degrades to INSERT.

-- =====================================================================
-- 1. research_results: restrict service-role policy to service_role only
-- =====================================================================
DROP POLICY IF EXISTS "Service role has full access" ON research_results;
CREATE POLICY "Service role has full access" ON research_results
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =====================================================================
-- 2. characters: missing DELETE policy + grant
-- =====================================================================
DROP POLICY IF EXISTS "Users can delete own project characters" ON characters;
CREATE POLICY "Users can delete own project characters" ON characters
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = characters.project_id
            AND projects.user_id = auth.uid()
        )
    );

GRANT DELETE ON characters TO authenticated;

-- =====================================================================
-- 3. worldbuilding: missing DELETE policy + grant
-- =====================================================================
DROP POLICY IF EXISTS "Users can delete own project worldbuilding" ON worldbuilding;
CREATE POLICY "Users can delete own project worldbuilding" ON worldbuilding
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = worldbuilding.project_id
            AND projects.user_id = auth.uid()
        )
    );

GRANT DELETE ON worldbuilding TO authenticated;

-- =====================================================================
-- 4. outlines: missing UPDATE and DELETE policies + grants
-- =====================================================================
DROP POLICY IF EXISTS "Users can update own project outlines" ON outlines;
CREATE POLICY "Users can update own project outlines" ON outlines
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = outlines.project_id
            AND projects.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own project outlines" ON outlines;
CREATE POLICY "Users can delete own project outlines" ON outlines
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = outlines.project_id
            AND projects.user_id = auth.uid()
        )
    );

GRANT UPDATE, DELETE ON outlines TO authenticated;

-- =====================================================================
-- 5. critiques: missing UPDATE policy + grant
-- =====================================================================
DROP POLICY IF EXISTS "Users can update own project critiques" ON critiques;
CREATE POLICY "Users can update own project critiques" ON critiques
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = critiques.project_id
            AND projects.user_id = auth.uid()
        )
    );

GRANT UPDATE ON critiques TO authenticated;

-- =====================================================================
-- 6. characters: add UNIQUE (project_id, name) for upsert onConflict
-- =====================================================================
-- Required by SupabaseService.upsertCharacters (onConflict: 'project_id,name').
-- Use a named constraint so ON CONFLICT (project_id, name) resolves correctly.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'characters_project_id_name_key'
    ) THEN
        ALTER TABLE characters
            ADD CONSTRAINT characters_project_id_name_key UNIQUE (project_id, name);
    END IF;
END$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
