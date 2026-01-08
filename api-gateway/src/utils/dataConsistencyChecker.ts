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

    const supabaseIds = new Set(supabaseCharacters.map((c) => c.id));
    const supabaseQdrantIds = new Set(
      supabaseCharacters.filter((c) => c.qdrant_id).map((c) => c.qdrant_id)
    );
    const qdrantIds = new Set(qdrantCharacters.map((c) => c.projectId === projectId ? c.name : null).filter(Boolean));

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
   */
  private async checkWorldbuildingConsistency(
    projectId: string
  ): Promise<ConsistencyCheckResult> {
    const supabaseWorldbuilding = await this.supabaseService.getWorldbuilding(projectId);
    
    // Get Qdrant worldbuilding by searching with empty query to get all
    // Note: This is a workaround since QdrantMemoryService doesn't have getProjectWorldbuilding
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
      orphanedVectorIds: [], // Cannot easily detect without full Qdrant scroll
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
    const missingEmbeddingIds = supabaseDrafts
      .filter((d) => !(d as unknown as Record<string, unknown>).qdrant_id)
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
   * Check consistency for all projects
   */
  async checkGlobalConsistency(): Promise<GlobalConsistencyReport> {
    const timestamp = new Date().toISOString();
    const { projects } = await this.supabaseService.listProjects(1, 1000);

    const projectReports: ConsistencyReport[] = [];
    let consistentProjects = 0;
    let totalOrphanedVectors = 0;
    let totalMissingEmbeddings = 0;

    for (const project of projects) {
      try {
        const report = await this.checkProjectConsistency(project.id);
        projectReports.push(report);

        if (report.summary.isConsistent) {
          consistentProjects++;
        }
        totalOrphanedVectors += report.summary.orphanedVectors;
        totalMissingEmbeddings += report.summary.missingEmbeddings;
      } catch (error) {
        console.error(`Failed to check consistency for project ${project.id}:`, error);
      }
    }

    return {
      timestamp,
      projectReports,
      globalSummary: {
        totalProjects: projects.length,
        consistentProjects,
        inconsistentProjects: projects.length - consistentProjects,
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
          await this.qdrantMemoryService.storeCharacter(projectId, character as unknown as Record<string, unknown>);
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
            element as unknown as Record<string, unknown>
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
      const draftRecord = draft as unknown as Record<string, unknown>;
      if (!draftRecord.qdrant_id) {
        try {
          await this.qdrantMemoryService.storeScene(
            projectId,
            draft.scene_number,
            draftRecord
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
