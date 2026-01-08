/**
 * Consistency Guardrail
 *
 * Checks that generated content doesn't contradict existing Key Constraints
 * Uses both keyword-based and semantic similarity (vector embeddings) to detect conflicts
 *
 * The guardrail operates in two modes:
 * 1. Keyword-based: Fast check against KeyConstraints for known contradiction patterns
 * 2. Semantic: Vector embedding similarity search against World Bible for deeper analysis
 */
import { KeyConstraint } from "../models/AgentModels";
/**
 * Guardrail result
 */
export interface GuardrailResult {
    passed: boolean;
    violations: string[];
    severity: "warning" | "error";
    semanticCheck?: {
        hasContradiction: boolean;
        contradictionScore: number;
        conflictingSections: Array<{
            sectionType: string;
            content: string;
            score: number;
        }>;
    };
    semanticCheckError?: string;
}
/**
 * Options for consistency check
 */
export interface ConsistencyCheckOptions {
    enableSemanticCheck?: boolean;
    semanticThreshold?: number;
    projectId?: string;
}
export declare class ConsistencyGuardrail {
    private worldBibleService;
    /**
     * Default semantic similarity threshold
     * Sections with similarity > threshold are flagged as potential contradictions
     */
    private readonly DEFAULT_SEMANTIC_THRESHOLD;
    /**
     * Check content for consistency violations against Key Constraints
     * Combines keyword-based and optional semantic (vector embedding) checks
     *
     * @param content - The content to check for consistency
     * @param constraints - Key constraints to check against
     * @param options - Optional settings for the check
     */
    check(content: string, constraints: KeyConstraint[], options?: ConsistencyCheckOptions): Promise<GuardrailResult>;
    /**
     * Perform semantic-only consistency check against World Bible
     * Use this for deep analysis without KeyConstraint checks
     *
     * @param projectId - Project ID for World Bible lookup
     * @param content - Content to check
     * @param threshold - Similarity threshold (default: 0.7)
     */
    checkSemanticConsistency(projectId: string, content: string, threshold?: number): Promise<GuardrailResult>;
    /**
     * Keyword-based constraint checking
     * Fast check for known contradiction patterns
     */
    private checkKeywordConstraints;
}
//# sourceMappingURL=ConsistencyGuardrail.d.ts.map