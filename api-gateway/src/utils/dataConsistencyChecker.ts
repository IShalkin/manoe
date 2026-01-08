/**
 * Data Consistency Checker for MANOE
 * 
 * Verifies consistency between Supabase and Qdrant data stores.
 * Detects orphaned vectors, missing embeddings, and data mismatches.
 */

import { SupabaseService, Character, Worldbuilding, Draft } from "../services/SupabaseService";
import { QdrantMemoryService } from "../services/QdrantMemoryService";

/**
 * Type-safe conversion helpers for Qdrant storage.
 * QdrantMemoryService.storeCharacter/storeWorldbuilding/storeScene expect Record<string, unknown>
 * because they extract specific fields internally. These helpers provide explicit conversion
 * while maintaining type safety at the call site.
 */
function characterToRecord(character: Character): Record<string, unknown> {
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

function worldbuildingToRecord(element: Worldbuilding): Record<string, unknown> {
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

function draftToRecord(draft: Draft): Record<string, unknown> {
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
function hasQdrantId(obj: Draft | Worldbuilding | Character): boolean {
  return 'qdrant_id' in obj && obj.qdrant_id !== undefined && obj.qdrant_id !== null;
}

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

export class DataConsistencyChecker {
  constructor(
    private supabaseService: SupabaseService,
    private qdrantMemoryService: QdrantMemoryService
  ) {}

  /**
   * Check consistency for a single project
   */
  async checkProjectConsistency(projectId: string): Promise<ConsistencyReport> {
    const timestamp = new Date().toISOString();

    const [charactersCheck, worldbuildingCheck, scenesCheck] = await Promise.all([
      this.checkCharactersConsistency(projectId),
      this.checkWorldbuildingConsistency(projectId),
      this.checkScenesConsistency(projectId),
    ]);

    const totalOrphanedVectors =
      charactersCheck.orphanedVectorIds.length +
      worldbuildingCheck.orphanedVectorIds.length +
      scenesCheck.orphanedVectorIds.length;

    const totalMissingEmbeddings =
      charactersCheck.missingEmbeddingIds.length +
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
        isConsistent:
          charactersCheck.isConsistent &&
          worldbuildingCheck.isConsistent &&
          scenesCheck.isConsistent,
      },
    };
  }

  /**
   * Check characters consistency between Supabase and Qdrant
   */
  private async checkCharactersConsistency(
    projectId: string
  ): Promise<ConsistencyCheckResult> {
    const supabaseCharacters = await this.supabaseService.getCharacters(projectId);
    const qdrantCharacters = await this.qdrantMemoryService.getProjectCharacters(projectId);

    // Note: supabaseIds and supabaseQdrantIds are available for future use if needed
    // for more sophisticated consistency checks (e.g., verifying qdrant_id references)
    const supabaseQdrantIds = new Set(
      supabaseCharacters.filter((c) => c.qdrant_id).map((c) => c.qdrant_id)
    );

    // Find orphaned vectors (in Qdrant but not referenced in Supabase)
    const orphanedVectorIds: string[] = [];
    for (const qdrantChar of qdrantCharacters) {
      const charName = qdrantChar.name;
      const matchingSupabase = supabaseCharacters.find((sc) => sc.name === charName);
      if (!matchingSupabase) {
        orphanedVectorIds.push(charName);
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
   * 
   * KNOWN LIMITATION: Orphan detection is not supported for worldbuilding entities.
   * This is because QdrantMemoryService doesn't expose a getProjectWorldbuilding() method
   * like it does for characters. The empty-string search workaround is limited to 100 results
   * and doesn't provide the entity identifiers needed for orphan detection.
   * 
   * To implement full orphan detection, either:
   * 1. Add getProjectWorldbuilding() to QdrantMemoryService (recommended)
   * 2. Use Qdrant's scroll API to fetch all vectors with project filter
   */
  private async checkWorldbuildingConsistency(
    projectId: string
  ): Promise<ConsistencyCheckResult> {
    const supabaseWorldbuilding = await this.supabaseService.getWorldbuilding(projectId);
    
    // Get Qdrant worldbuilding count by searching with empty query
    // Note: Limited to 100 results - may undercount for large projects
    let qdrantCount = 0;
    try {
      const searchResults = await this.qdrantMemoryService.searchWorldbuilding(
        projectId,
        "",
        100
      );
      qdrantCount = searchResults.length;
    } catch {
      // If search fails, assume 0 vectors
      qdrantCount = 0;
    }

    // Find missing embeddings (in Supabase but no qdrant_id)
    const missingEmbeddingIds = supabaseWorldbuilding
      .filter((w) => !w.qdrant_id)
      .map((w) => w.id);

    return {
      supabaseCount: supabaseWorldbuilding.length,
      qdrantCount,
      // Orphan detection not supported - see method documentation above
      orphanedVectorIds: [],
      missingEmbeddingIds,
      isConsistent: missingEmbeddingIds.length === 0,
    };
  }

  /**
   * Check scenes/drafts consistency between Supabase and Qdrant
   */
  private async checkScenesConsistency(
    projectId: string
  ): Promise<ConsistencyCheckResult> {
    const supabaseDrafts = await this.supabaseService.getDrafts(projectId);
    
    // Get Qdrant scenes by searching with empty query
    let qdrantCount = 0;
    try {
      const searchResults = await this.qdrantMemoryService.searchScenes(
        projectId,
        "",
        100
      );
      qdrantCount = searchResults.length;
    } catch {
      qdrantCount = 0;
    }

    // Find missing embeddings (drafts without qdrant_id)
    // Note: Draft interface doesn't include qdrant_id, but it may exist at runtime
    const missingEmbeddingIds = supabaseDrafts
      .filter((d) => !hasQdrantId(d as Draft))
      .map((d) => d.id);

    return {
      supabaseCount: supabaseDrafts.length,
      qdrantCount,
      orphanedVectorIds: [],
      missingEmbeddingIds,
      isConsistent: missingEmbeddingIds.length === 0,
    };
  }

  /**
   * Check consistency for all projects using pagination to handle large datasets.
   * Processes projects in batches to avoid memory issues and timeouts.
   */
  async checkGlobalConsistency(): Promise<GlobalConsistencyReport> {
    const timestamp = new Date().toISOString();
    const projectReports: ConsistencyReport[] = [];
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
          projectReports.push(report);

          if (report.summary.isConsistent) {
            consistentProjects++;
          }
          totalOrphanedVectors += report.summary.orphanedVectors;
          totalMissingEmbeddings += report.summary.missingEmbeddings;
          totalProjectsProcessed++;
        } catch (error) {
          console.error(`Failed to check consistency for project ${project.id}:`, error);
          totalProjectsProcessed++;
        }
      }

      // If we got fewer projects than the batch size, we've reached the end
      if (projects.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return {
      timestamp,
      projectReports,
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
  async repairMissingEmbeddings(projectId: string): Promise<{
    repairedCharacters: number;
    repairedWorldbuilding: number;
    repairedScenes: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let repairedCharacters = 0;
    let repairedWorldbuilding = 0;
    let repairedScenes = 0;

    // Re-index characters without qdrant_id
    const characters = await this.supabaseService.getCharacters(projectId);
    for (const character of characters) {
      if (!character.qdrant_id) {
        try {
          await this.qdrantMemoryService.storeCharacter(
            projectId,
            characterToRecord(character)
          );
          repairedCharacters++;
        } catch (error) {
          errors.push(`Failed to re-index character ${character.id}: ${error}`);
        }
      }
    }

    // Re-index worldbuilding without qdrant_id
    const worldbuilding = await this.supabaseService.getWorldbuilding(projectId);
    for (const element of worldbuilding) {
      if (!element.qdrant_id) {
        try {
          await this.qdrantMemoryService.storeWorldbuilding(
            projectId,
            element.element_type,
            worldbuildingToRecord(element)
          );
          repairedWorldbuilding++;
        } catch (error) {
          errors.push(`Failed to re-index worldbuilding ${element.id}: ${error}`);
        }
      }
    }

    // Re-index drafts without qdrant_id
    const drafts = await this.supabaseService.getDrafts(projectId);
    for (const draft of drafts) {
      if (!hasQdrantId(draft as Draft)) {
        try {
          await this.qdrantMemoryService.storeScene(
            projectId,
            draft.scene_number,
            draftToRecord(draft)
          );
          repairedScenes++;
        } catch (error) {
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

/**
 * Factory function to create a DataConsistencyChecker instance
 */
export function createDataConsistencyChecker(
  supabaseService: SupabaseService,
  qdrantMemoryService: QdrantMemoryService
): DataConsistencyChecker {
  return new DataConsistencyChecker(supabaseService, qdrantMemoryService);
}
