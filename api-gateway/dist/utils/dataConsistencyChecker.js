"use strict";
/**
 * Data Consistency Checker for MANOE
 *
 * Verifies consistency between Supabase and Qdrant data stores.
 * Detects orphaned vectors, missing embeddings, and data mismatches.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataConsistencyChecker = void 0;
exports.createDataConsistencyChecker = createDataConsistencyChecker;
/**
 * Type-safe conversion helpers for Qdrant storage.
 * QdrantMemoryService.storeCharacter/storeWorldbuilding/storeScene expect Record<string, unknown>
 * because they extract specific fields internally. These helpers provide explicit conversion
 * while maintaining type safety at the call site.
 */
function characterToRecord(character) {
    return {
        id: character.id,
        project_id: character.project_id,
        name: character.name,
        archetype: character.archetype,
        core_motivation: character.core_motivation,
        inner_trap: character.inner_trap,
        psychological_wound: character.psychological_wound,
        visual_signature: character.visual_signature,
        qdrant_id: character.qdrant_id,
        created_at: character.created_at,
    };
}
function worldbuildingToRecord(element) {
    return {
        id: element.id,
        project_id: element.project_id,
        element_type: element.element_type,
        name: element.name,
        description: element.description,
        attributes: element.attributes,
        qdrant_id: element.qdrant_id,
        created_at: element.created_at,
    };
}
function draftToRecord(draft) {
    return {
        id: draft.id,
        project_id: draft.project_id,
        scene_number: draft.scene_number,
        narrative_content: draft.narrative_content,
        title: draft.title,
        word_count: draft.word_count,
        sensory_details: draft.sensory_details,
        subtext_layer: draft.subtext_layer,
        emotional_shift: draft.emotional_shift,
        status: draft.status,
        revision_count: draft.revision_count,
        semantic_check_error: draft.semantic_check_error,
        contradiction_score: draft.contradiction_score,
        created_at: draft.created_at,
    };
}
/**
 * Type guard to check if a draft has a qdrant_id field.
 * The Draft interface doesn't include qdrant_id, but some drafts may have it at runtime.
 */
function hasQdrantId(obj) {
    return 'qdrant_id' in obj && obj.qdrant_id !== undefined && obj.qdrant_id !== null;
}
class DataConsistencyChecker {
    supabaseService;
    qdrantMemoryService;
    constructor(supabaseService, qdrantMemoryService) {
        this.supabaseService = supabaseService;
        this.qdrantMemoryService = qdrantMemoryService;
    }
    /**
     * Check consistency for a single project
     */
    async checkProjectConsistency(projectId) {
        const timestamp = new Date().toISOString();
        const [charactersCheck, worldbuildingCheck, scenesCheck] = await Promise.all([
            this.checkCharactersConsistency(projectId),
            this.checkWorldbuildingConsistency(projectId),
            this.checkScenesConsistency(projectId),
        ]);
        const totalOrphanedVectors = charactersCheck.orphanedVectorIds.length +
            worldbuildingCheck.orphanedVectorIds.length +
            scenesCheck.orphanedVectorIds.length;
        const totalMissingEmbeddings = charactersCheck.missingEmbeddingIds.length +
            worldbuildingCheck.missingEmbeddingIds.length +
            scenesCheck.missingEmbeddingIds.length;
        return {
            timestamp,
            projectId,
            checks: {
                characters: charactersCheck,
                worldbuilding: worldbuildingCheck,
                scenes: scenesCheck,
            },
            summary: {
                totalIssues: totalOrphanedVectors + totalMissingEmbeddings,
                orphanedVectors: totalOrphanedVectors,
                missingEmbeddings: totalMissingEmbeddings,
                isConsistent: charactersCheck.isConsistent &&
                    worldbuildingCheck.isConsistent &&
                    scenesCheck.isConsistent,
            },
        };
    }
    /**
     * Check characters consistency between Supabase and Qdrant
     * Uses scroll API with Qdrant point IDs for accurate orphan detection
     */
    async checkCharactersConsistency(projectId) {
        const supabaseCharacters = await this.supabaseService.getCharacters(projectId);
        const qdrantCharacters = await this.qdrantMemoryService.getProjectCharacters(projectId);
        // Create Set for O(1) lookup instead of O(n) find() in loop
        const supabaseIdSet = new Set(supabaseCharacters.map((sc) => sc.id));
        // Find orphaned vectors (in Qdrant but not referenced in Supabase)
        // Match by the Supabase UUID stored in character.id
        const orphanedVectorIds = [];
        for (const qdrantChar of qdrantCharacters) {
            const characterId = qdrantChar.character?.id;
            if (!characterId) {
                // Vector has no character ID - consider it orphaned
                // Use a descriptive identifier that helps with debugging
                const identifier = qdrantChar.qdrantPointId || `unknown-char-${qdrantChar.name || "unnamed"}`;
                orphanedVectorIds.push(identifier);
                continue;
            }
            if (!supabaseIdSet.has(characterId)) {
                orphanedVectorIds.push(qdrantChar.qdrantPointId || String(characterId));
            }
        }
        // Find missing embeddings (in Supabase but no qdrant_id)
        const missingEmbeddingIds = supabaseCharacters
            .filter((c) => !c.qdrant_id)
            .map((c) => c.id);
        return {
            supabaseCount: supabaseCharacters.length,
            qdrantCount: qdrantCharacters.length,
            orphanedVectorIds,
            missingEmbeddingIds,
            isConsistent: orphanedVectorIds.length === 0 && missingEmbeddingIds.length === 0,
        };
    }
    /**
     * Check worldbuilding consistency between Supabase and Qdrant
     * Uses scroll API for accurate counts and full orphan detection
     */
    async checkWorldbuildingConsistency(projectId) {
        const supabaseWorldbuilding = await this.supabaseService.getWorldbuilding(projectId);
        // Get all worldbuilding from Qdrant using scroll API (no 100-element limitation)
        const qdrantWorldbuilding = await this.qdrantMemoryService.getProjectWorldbuilding(projectId);
        // Create Set for O(1) lookup instead of O(n) find() in loop
        const supabaseIdSet = new Set(supabaseWorldbuilding.map((swb) => swb.id));
        // Find orphaned vectors (in Qdrant but not in Supabase)
        // Match by the Supabase UUID stored in element.id
        const orphanedVectorIds = [];
        for (const qdrantWb of qdrantWorldbuilding) {
            const elementId = qdrantWb.element?.id;
            if (!elementId) {
                // Vector has no element ID - consider it orphaned
                // Use a descriptive identifier that helps with debugging
                const identifier = qdrantWb.qdrantPointId || `unknown-wb-${qdrantWb.elementType || "unknown-type"}`;
                orphanedVectorIds.push(identifier);
                continue;
            }
            if (!supabaseIdSet.has(elementId)) {
                orphanedVectorIds.push(qdrantWb.qdrantPointId || String(elementId));
            }
        }
        // Find missing embeddings (in Supabase but no qdrant_id)
        const missingEmbeddingIds = supabaseWorldbuilding
            .filter((w) => !w.qdrant_id)
            .map((w) => w.id);
        return {
            supabaseCount: supabaseWorldbuilding.length,
            qdrantCount: qdrantWorldbuilding.length,
            orphanedVectorIds,
            missingEmbeddingIds,
            isConsistent: orphanedVectorIds.length === 0 && missingEmbeddingIds.length === 0,
        };
    }
    /**
     * Check scenes/drafts consistency between Supabase and Qdrant
     * Uses scroll API for accurate counts and full orphan detection
     */
    async checkScenesConsistency(projectId) {
        const supabaseDrafts = await this.supabaseService.getDrafts(projectId);
        // Get all scenes from Qdrant using scroll API (no 100-element limitation)
        const qdrantScenes = await this.qdrantMemoryService.getProjectScenes(projectId);
        // Create Set for O(1) lookup instead of O(n) find() in loop
        const supabaseIdSet = new Set(supabaseDrafts.map((sd) => sd.id));
        // Find orphaned vectors (in Qdrant but not in Supabase)
        // Match by the Supabase UUID stored in scene.id
        const orphanedVectorIds = [];
        for (const qdrantScene of qdrantScenes) {
            const sceneId = qdrantScene.scene?.id;
            if (!sceneId) {
                // Vector has no scene ID - consider it orphaned
                // Use a descriptive identifier that helps with debugging
                const identifier = qdrantScene.qdrantPointId || `unknown-scene-${qdrantScene.sceneNumber || "unknown-number"}`;
                orphanedVectorIds.push(identifier);
                continue;
            }
            if (!supabaseIdSet.has(sceneId)) {
                orphanedVectorIds.push(qdrantScene.qdrantPointId || String(sceneId));
            }
        }
        // Find missing embeddings (drafts without qdrant_id)
        // Note: Draft interface doesn't include qdrant_id, but it may exist at runtime
        const missingEmbeddingIds = supabaseDrafts
            .filter((d) => !hasQdrantId(d))
            .map((d) => d.id);
        return {
            supabaseCount: supabaseDrafts.length,
            qdrantCount: qdrantScenes.length,
            orphanedVectorIds,
            missingEmbeddingIds,
            isConsistent: orphanedVectorIds.length === 0 && missingEmbeddingIds.length === 0,
        };
    }
    /**
     * Check consistency for all projects using pagination to handle large datasets.
     * Processes projects in batches to avoid memory issues and timeouts.
     *
     * Note: Only inconsistent project reports are included in the response to reduce
     * memory usage. For large datasets, consider using a background job instead.
     */
    async checkGlobalConsistency() {
        const timestamp = new Date().toISOString();
        // Only keep reports for inconsistent projects to reduce memory usage
        const inconsistentProjectReports = [];
        let consistentProjects = 0;
        let totalOrphanedVectors = 0;
        let totalMissingEmbeddings = 0;
        let totalProjectsProcessed = 0;
        // Process projects in batches using pagination
        const BATCH_SIZE = 100;
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const { projects } = await this.supabaseService.listProjects(page, BATCH_SIZE);
            if (projects.length === 0) {
                hasMore = false;
                break;
            }
            for (const project of projects) {
                try {
                    const report = await this.checkProjectConsistency(project.id);
                    if (report.summary.isConsistent) {
                        consistentProjects++;
                    }
                    else {
                        // Only store reports for inconsistent projects
                        inconsistentProjectReports.push(report);
                    }
                    totalOrphanedVectors += report.summary.orphanedVectors;
                    totalMissingEmbeddings += report.summary.missingEmbeddings;
                    totalProjectsProcessed++;
                }
                catch (error) {
                    console.error(`Failed to check consistency for project ${project.id}:`, error);
                    totalProjectsProcessed++;
                }
            }
            // If we got fewer projects than the batch size, we've reached the end
            if (projects.length < BATCH_SIZE) {
                hasMore = false;
            }
            else {
                page++;
            }
        }
        return {
            timestamp,
            projectReports: inconsistentProjectReports,
            globalSummary: {
                totalProjects: totalProjectsProcessed,
                consistentProjects,
                inconsistentProjects: totalProjectsProcessed - consistentProjects,
                totalOrphanedVectors,
                totalMissingEmbeddings,
            },
        };
    }
    /**
     * Repair missing embeddings for a project by re-indexing
     */
    async repairMissingEmbeddings(projectId) {
        const errors = [];
        let repairedCharacters = 0;
        let repairedWorldbuilding = 0;
        let repairedScenes = 0;
        // Re-index characters without qdrant_id
        const characters = await this.supabaseService.getCharacters(projectId);
        for (const character of characters) {
            if (!character.qdrant_id) {
                try {
                    await this.qdrantMemoryService.storeCharacter(projectId, characterToRecord(character));
                    repairedCharacters++;
                }
                catch (error) {
                    errors.push(`Failed to re-index character ${character.id}: ${error}`);
                }
            }
        }
        // Re-index worldbuilding without qdrant_id
        const worldbuilding = await this.supabaseService.getWorldbuilding(projectId);
        for (const element of worldbuilding) {
            if (!element.qdrant_id) {
                try {
                    await this.qdrantMemoryService.storeWorldbuilding(projectId, element.element_type, worldbuildingToRecord(element));
                    repairedWorldbuilding++;
                }
                catch (error) {
                    errors.push(`Failed to re-index worldbuilding ${element.id}: ${error}`);
                }
            }
        }
        // Re-index drafts without qdrant_id
        const drafts = await this.supabaseService.getDrafts(projectId);
        for (const draft of drafts) {
            if (!hasQdrantId(draft)) {
                try {
                    await this.qdrantMemoryService.storeScene(projectId, draft.scene_number, draftToRecord(draft));
                    repairedScenes++;
                }
                catch (error) {
                    errors.push(`Failed to re-index draft ${draft.id}: ${error}`);
                }
            }
        }
        return {
            repairedCharacters,
            repairedWorldbuilding,
            repairedScenes,
            errors,
        };
    }
}
exports.DataConsistencyChecker = DataConsistencyChecker;
/**
 * Factory function to create a DataConsistencyChecker instance
 */
function createDataConsistencyChecker(supabaseService, qdrantMemoryService) {
    return new DataConsistencyChecker(supabaseService, qdrantMemoryService);
}
//# sourceMappingURL=dataConsistencyChecker.js.map