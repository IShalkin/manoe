-- Add semantic consistency check fields to drafts table
-- These fields store results from WorldBibleEmbeddingService similarity checks
-- 
-- IMPORTANT: These fields track semantic SIMILARITY, not contradiction detection.
-- High similarity scores mean the content is talking about similar topics as
-- existing World Bible entries - useful for human review but NOT actual contradiction.
--
-- semantic_check_error: Explanation of related World Bible content found (if any)
-- contradiction_score: Similarity score (0-1) - higher means MORE similar, not more contradictory

ALTER TABLE drafts 
ADD COLUMN IF NOT EXISTS semantic_check_error TEXT,
ADD COLUMN IF NOT EXISTS contradiction_score DECIMAL(4,3) CHECK (contradiction_score >= 0 AND contradiction_score <= 1);

-- Add comment for documentation
COMMENT ON COLUMN drafts.semantic_check_error IS 'Explanation of related World Bible content found by semantic similarity search (for human review)';
COMMENT ON COLUMN drafts.contradiction_score IS 'Similarity score (0-1) - higher means MORE similar to World Bible entries, not more contradictory';
