/**
 * Data Consistency Checker for MANOE
 *
 * Verifies consistency between Supabase and Qdrant data stores.
 * Detects orphaned vectors, missing embeddings, and data mismatches.
 */
import { SupabaseService } from "../services/SupabaseService";
import { QdrantMemoryService } from "../services/QdrantMemoryService";
export interface ConsistencyReport {
    timestamp: string;
    projectId: string;
    checks: {
        characters: ConsistencyCheckResult;
        worldbuilding: ConsistencyCheckResult;
        scenes: ConsistencyCheckResult;
    };
    summary: {
        totalIssues: number;
        orphanedVectors: number;
        missingEmbeddings: number;
        isConsistent: boolean;
    };
}
export interface ConsistencyCheckResult {
    supabaseCount: number;
    qdrantCount: number;
    orphanedVectorIds: string[];
    missingEmbeddingIds: string[];
    isConsistent: boolean;
}
export interface GlobalConsistencyReport {
    timestamp: string;
    projectReports: ConsistencyReport[];
    globalSummary: {
        totalProjects: number;
        consistentProjects: number;
        inconsistentProjects: number;
        totalOrphanedVectors: number;
        totalMissingEmbeddings: number;
    };
}
export declare class DataConsistencyChecker {
    private supabaseService;
    private qdrantMemoryService;
    constructor(supabaseService: SupabaseService, qdrantMemoryService: QdrantMemoryService);
    /**
     * Check consistency for a single project
     */
    checkProjectConsistency(projectId: string): Promise<ConsistencyReport>;
    /**
     * Check characters consistency between Supabase and Qdrant
     * Uses scroll API with Qdrant point IDs for accurate orphan detection
     */
    private checkCharactersConsistency;
    /**
     * Check worldbuilding consistency between Supabase and Qdrant
     * Uses scroll API for accurate counts and full orphan detection
     */
    private checkWorldbuildingConsistency;
    /**
     * Check scenes/drafts consistency between Supabase and Qdrant
     * Uses scroll API for accurate counts and full orphan detection
     */
    private checkScenesConsistency;
    /**
     * Check consistency for all projects using pagination to handle large datasets.
     * Processes projects in batches to avoid memory issues and timeouts.
     *
     * Note: Only inconsistent project reports are included in the response to reduce
     * memory usage. For large datasets, consider using a background job instead.
     */
    checkGlobalConsistency(): Promise<GlobalConsistencyReport>;
    /**
     * Repair missing embeddings for a project by re-indexing
     */
    repairMissingEmbeddings(projectId: string): Promise<{
        repairedCharacters: number;
        repairedWorldbuilding: number;
        repairedScenes: number;
        errors: string[];
    }>;
}
/**
 * Factory function to create a DataConsistencyChecker instance
 */
export declare function createDataConsistencyChecker(supabaseService: SupabaseService, qdrantMemoryService: QdrantMemoryService): DataConsistencyChecker;
//# sourceMappingURL=dataConsistencyChecker.d.ts.map