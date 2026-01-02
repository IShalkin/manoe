-- Add semantic consistency check fields to drafts table
-- These fields store results from WorldBibleEmbeddingService consistency checks
-- semantic_check_error: Explanation of detected contradiction (if any)
-- contradiction_score: Similarity score indicating potential contradiction (0-1)

ALTER TABLE drafts 
ADD COLUMN IF NOT EXISTS semantic_check_error TEXT,
ADD COLUMN IF NOT EXISTS contradiction_score DECIMAL(4,3);

-- Add comment for documentation
COMMENT ON COLUMN drafts.semantic_check_error IS 'Explanation of semantic consistency issue detected by WorldBibleEmbeddingService';
COMMENT ON COLUMN drafts.contradiction_score IS 'Similarity score (0-1) indicating potential contradiction with World Bible entries';
