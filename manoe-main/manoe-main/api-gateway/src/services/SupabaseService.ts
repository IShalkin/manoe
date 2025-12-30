import { Service } from "@tsed/di";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { QdrantMemoryService } from "./QdrantMemoryService";
import { LangfuseService } from "./LangfuseService";
import { z } from "zod";
import { SupabaseCharacterSchema, SupabaseWorldbuildingSchema, SupabaseDraftSchema, SupabaseValidationError } from "../schemas/SupabaseSchemas";

interface Project {
  id: string;
  user_id?: string;
  seed_idea: string;
  moral_compass: string;
  target_audience?: string;
  theme_core?: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface Character {
  id: string;
  project_id: string;
  name: string;
  archetype?: string;
  core_motivation?: string;
  inner_trap?: string;
  psychological_wound?: string;
  visual_signature?: string;
  qdrant_id?: string;
  created_at: string;
}

interface Outline {
  id: string;
  project_id: string;
  structure_type: string;
  scenes: unknown[];
  created_at: string;
}

interface Draft {
  id: string;
  project_id: string;
  scene_number: number;
  content: string;
  sensory_details?: unknown;
  subtext_layer?: string;
  emotional_shift?: string;
  status: string;
  revision_count: number;
  qdrant_id?: string;
  created_at: string;
}

interface Worldbuilding {
  id: string;
  project_id: string;
  element_type: string;
  name: string;
  description: string;
  attributes?: Record<string, unknown>;
  qdrant_id?: string;
  created_at: string;
}

interface AuditLog {
  id: string;
  project_id: string;
  agent_name: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  token_usage?: unknown;
  duration_ms?: number;
  created_at: string;
}

export interface ResearchHistoryItem {
  id: string;
  provider: string;
  model?: string;
  seed_idea: string;
  target_audience?: string;
  themes?: string[];
  moral_compass?: string;
  content: string;
  prompt_context?: string;
  citations?: Array<{ url: string; title?: string }>;
  created_at: string;
}

@Service()
export class SupabaseService {
  private client: SupabaseClient | null = null;

  @Inject()
  private qdrantMemory: QdrantMemoryService;

  @Inject()
  private langfuse: LangfuseService;

  constructor() {
    this.connect();
  }

  private connect(): void {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("Supabase credentials not configured");
      return;
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    console.log("Connected to Supabase");
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error("Supabase client not initialized");
    }
    return this.client;
  }

  async healthCheck(): Promise<boolean> {
    const client = this.getClient();
    const { error } = await client.from("projects").select("id").limit(1);
    if (error) {
      throw new Error(`Supabase health check failed: ${error.message}`);
    }
    return true;
  }

  // ========================================================================
  // Project Operations
  // ========================================================================

  async createProject(data: Partial<Project>): Promise<Project> {
    const client = this.getClient();
    const { data: project, error } = await client
      .from("projects")
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }

    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    const client = this.getClient();
    const { data: project, error } = await client
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get project: ${error.message}`);
    }

    return project;
  }

  async updateProjectStatus(id: string, status: string): Promise<void> {
    const client = this.getClient();
    const { error } = await client
      .from("projects")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to update project status: ${error.message}`);
    }
  }

  async listProjects(
    page: number = 1,
    limit: number = 10
  ): Promise<{ projects: Project[]; total: number }> {
    const client = this.getClient();
    const offset = (page - 1) * limit;

    const { data: projects, error, count } = await client
      .from("projects")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }

    return {
      projects: projects || [],
      total: count || 0,
    };
  }

  async deleteProject(id: string): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("projects").delete().eq("id", id);

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  // ========================================================================
  // Narrative Possibility Operations
  // ========================================================================

  async getNarrativePossibility(projectId: string): Promise<unknown | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from("narrative_possibilities")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get narrative possibility: ${error.message}`);
    }

    return data;
  }

  async saveNarrativePossibility(
    projectId: string,
    narrative: unknown
  ): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("narrative_possibilities").upsert({
      project_id: projectId,
      ...narrative as object,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save narrative possibility: ${error.message}`);
    }
  }

  // ========================================================================
  // Validation Helper
  // ========================================================================

  /**
   * Validate data against Supabase schema before storage
   * Fail-fast: throws SupabaseValidationError if validation fails
   * Logs validation errors to Langfuse for observability
   */
  private validateForStorage<T>(
    data: Record<string, unknown>,
    schema: z.ZodSchema<T>,
    operation: string,
    recordType: string
  ): T {
    const result = schema.safeParse(data);

    if (!result.success) {
      const errorSummary = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');

      console.error(
        `[SupabaseService] Validation failed for ${operation} (${recordType}):`,
        errorSummary
      );

      // Log validation error to Langfuse for observability
      if (this.langfuse.isEnabled) {
        this.langfuse.addEvent(`supabase_validation_error`, {
          operation,
          recordType,
          errors: result.error.errors,
        });
      }

      throw new SupabaseValidationError(result.error, operation, recordType);
    }

    console.log(
      `[SupabaseService] Validation passed for ${operation} (${recordType})`
    );
    return result.data;
  }

  // ========================================================================
  // Character Operations
  // ========================================================================

  async getCharacters(projectId: string): Promise<Character[]> {
    const client = this.getClient();
    const { data: characters, error } = await client
      .from("characters")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get characters: ${error.message}`);
    }

    return characters || [];
  }

  async saveCharacter(
    projectId: string,
    character: Partial<Character>,
    qdrantId?: string
  ): Promise<Character> {
    const client = this.getClient();
    const { camelToSnakeCase } = await import("../utils/stringUtils");

    // Transform camelCase to snake_case
    const snakeCaseChar = camelToSnakeCase(character);

    // Validate against Supabase schema (strict validation)
    const validated = this.validateForStorage(
      { ...snakeCaseChar, project_id: projectId, qdrant_id: qdrantId },
      SupabaseCharacterSchema,
      "saveCharacter",
      "character"
    );

    const { data, error } = await client
      .from("characters")
      .insert(validated)
      .select()
      .single();

    if (error) {
      console.error(`[SupabaseService] Failed to save character:`, error.message);
      throw new Error(`Failed to save character: ${error.message}`);
    }

    console.log(
      `[SupabaseService] Character saved with qdrant_id: ${qdrantId || 'N/A'}`
    );
    return data;
  }

  // ========================================================================
  // Worldbuilding Operations
  // ========================================================================

  async getWorldbuilding(
    projectId: string,
    elementType?: string
  ): Promise<unknown[]> {
    const client = this.getClient();
    let query = client
      .from("worldbuilding")
      .select("*")
      .eq("project_id", projectId);

    if (elementType) {
      query = query.eq("element_type", elementType);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get worldbuilding: ${error.message}`);
    }

    return data || [];
  }

  async saveWorldbuilding(
    projectId: string,
    elementType: string,
    element: Record<string, unknown>,
    qdrantId?: string
  ): Promise<Worldbuilding> {
    const client = this.getClient();
    const { normalizeWorldbuildingElement } = await import("../utils/schemaNormalizers");

    // Normalize element
    const normalized = normalizeWorldbuildingElement(elementType, element);

    // Validate against Supabase schema
    const validated = this.validateForStorage(
      {
        project_id: projectId,
        element_type: elementType,
        name: normalized.name,
        description: normalized.description,
        attributes: normalized.attributes,
        qdrant_id: qdrantId,
      },
      SupabaseWorldbuildingSchema,
      "saveWorldbuilding",
      "worldbuilding"
    );

    const { data, error } = await client
      .from("worldbuilding")
      .insert(validated)
      .select()
      .single();

    if (error) {
      console.error(
        `[SupabaseService] Failed to save worldbuilding (${elementType}):`,
        error.message
      );
      throw new Error(`Failed to save worldbuilding: ${error.message}`);
    }

    console.log(
      `[SupabaseService] Worldbuilding saved (${elementType}: ${normalized.name}) with qdrant_id: ${qdrantId || 'N/A'}`
    );
    return data;
  }

  // ========================================================================
  // Outline Operations
  // ========================================================================

  async getOutline(projectId: string): Promise<Outline | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from("outlines")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get outline: ${error.message}`);
    }

    return data;
  }

  async saveOutline(projectId: string, outline: Partial<Outline>): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("outlines").upsert({
      project_id: projectId,
      ...outline,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save outline: ${error.message}`);
    }
  }

  // ========================================================================
  // Draft Operations
  // ========================================================================

  async getDrafts(projectId: string): Promise<Draft[]> {
    const client = this.getClient();
    const { data: drafts, error } = await client
      .from("drafts")
      .select("*")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true });

    if (error) {
      throw new Error(`Failed to get drafts: ${error.message}`);
    }

    return drafts || [];
  }

  async saveDraft(
    projectId: string,
    draft: Partial<Draft>,
    qdrantId?: string
  ): Promise<Draft> {
    const client = this.getClient();
    const { camelToSnakeCase } = await import("../utils/stringUtils");

    // Transform camelCase to snake_case
    const snakeCaseDraft = camelToSnakeCase(draft);

    // Validate against Supabase schema
    const validated = this.validateForStorage(
      { ...snakeCaseDraft, project_id: projectId, qdrant_id: qdrantId },
      SupabaseDraftSchema,
      "saveDraft",
      "draft"
    );

    const { data, error } = await client
      .from("drafts")
      .upsert(validated)
      .select()
      .single();

    if (error) {
      console.error(`[SupabaseService] Failed to save draft:`, error.message);
      throw new Error(`Failed to save draft: ${error.message}`);
    }

    console.log(
      `[SupabaseService] Draft saved with qdrant_id: ${qdrantId || 'N/A'}`
    );
    return data;
  }

  // ========================================================================
  // Critique Operations
  // ========================================================================

  async getCritiques(projectId: string): Promise<unknown[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from("critiques")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get critiques: ${error.message}`);
    }

    return data || [];
  }

  // ========================================================================
  // Audit Log Operations
  // ========================================================================

  async getAuditLogs(
    projectId: string,
    agentName?: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    const client = this.getClient();
    let query = client
      .from("audit_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (agentName) {
      query = query.eq("agent_name", agentName);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }

    return data || [];
  }

  async saveAuditLog(log: Partial<AuditLog>): Promise<void> {
    const client = this.getClient();
    const { error } = await client.from("audit_logs").insert({
      ...log,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save audit log: ${error.message}`);
    }
  }

  // ========================================================================
  // Run Artifact Operations (for StorytellerOrchestrator)
  // ========================================================================

  /**
   * Save a run artifact (narrative, characters, worldbuilding, outline, draft, etc.)
   */
  async saveRunArtifact(params: {
    runId: string;
    projectId: string;
    artifactType: string;
    content: unknown;
    phase?: string;
  }): Promise<void> {
    const client = this.getClient();
    
    // Derive phase from artifact type if not provided
    const phase = params.phase || this.derivePhaseFromArtifactType(params.artifactType);
    
    const { error } = await client.from("run_artifacts").upsert({
      run_id: params.runId,
      project_id: params.projectId,
      artifact_type: params.artifactType,
      phase: phase,
      content: params.content,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(`Failed to save run artifact: ${error.message}`);
    }
  }
  
  /**
   * Derive phase from artifact type
   */
  private derivePhaseFromArtifactType(artifactType: string): string {
    if (artifactType === "narrative") return "genesis";
    if (artifactType === "characters") return "characters";
    if (artifactType === "worldbuilding") return "worldbuilding";
    if (artifactType === "outline") return "outlining";
    if (artifactType === "advanced_plan") return "advanced_planning";
    if (artifactType.startsWith("draft_scene_")) return "drafting";
    if (artifactType.startsWith("critique_scene_")) return "drafting";
    if (artifactType.startsWith("revision_scene_")) return "drafting";
    if (artifactType.startsWith("final_scene_")) return "polish";
    if (artifactType === "run_state_snapshot") return "snapshot";
    return "unknown";
  }

  /**
   * Get run artifacts by run ID
   */
  async getRunArtifacts(runId: string): Promise<unknown[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from("run_artifacts")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to get run artifacts: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a specific run artifact by type
   */
  async getRunArtifact(
    runId: string,
    artifactType: string
  ): Promise<unknown | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from("run_artifacts")
      .select("*")
      .eq("run_id", runId)
      .eq("artifact_type", artifactType)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get run artifact: ${error.message}`);
    }

    return data;
  }

  // ========================================================================
  // Research Results Operations (Eternal Memory)
  // ========================================================================

  /**
   * Get research history for a user
   */
  async getResearchHistory(limit: number = 20): Promise<ResearchHistoryItem[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from("research_results")
      .select("id, provider, model, seed_idea, target_audience, themes, moral_compass, content, prompt_context, citations, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get research history: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a specific research result by ID
   */
  async getResearchResult(id: string): Promise<ResearchHistoryItem | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from("research_results")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get research result: ${error.message}`);
    }

    return data;
  }

  // ========================================================================
  // State Recovery Operations
  // ========================================================================

  /**
   * Get all interrupted run state snapshots for recovery after restart
   * Returns runs that were saved during graceful shutdown and haven't been completed
   */
  async getInterruptedRunSnapshots(): Promise<Array<{ run_id: string; project_id: string; content: unknown }>> {
    const client = this.getClient();
    const { data, error } = await client
      .from("run_artifacts")
      .select("run_id, project_id, content")
      .eq("artifact_type", "run_state_snapshot")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`Failed to get interrupted run snapshots: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Delete a run state snapshot after successful restoration or completion
   */
  async deleteRunStateSnapshot(runId: string): Promise<void> {
    const client = this.getClient();
    const { error } = await client
      .from("run_artifacts")
      .delete()
      .eq("run_id", runId)
      .eq("artifact_type", "run_state_snapshot");

    if (error) {
      console.error(`Failed to delete run state snapshot: ${error.message}`);
    }
  }

  /**
   * Reindex project artifacts to Qdrant
   * Used for manual reindexing of existing projects
   * Processes in batches (5-10 items) to avoid rate limiting
   */
  async reindexProject(projectId: string): Promise<{
    characters: number;
    worldbuilding: number;
    drafts: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let indexed = { characters: 0, worldbuilding: 0, drafts: 0 };

    // Fail-fast: Check if Qdrant is initialized
    if (!this.qdrantMemory) {
      throw new Error("Qdrant Memory Service is not initialized. Cannot reindex.");
    }

    try {
      // Reindex characters
      const characters = await this.getCharacters(projectId);
      const BATCH_SIZE = 5;

      for (let i = 0; i < characters.length; i += BATCH_SIZE) {
        const batch = characters.slice(i, i + BATCH_SIZE);
        for (const character of batch) {
          if (!character.qdrant_id) {
            try {
              const qdrantId = await this.qdrantMemory.storeCharacter(
                projectId,
                character as Record<string, unknown>
              );
              if (qdrantId) {
                await this.saveCharacter(projectId, character, qdrantId);
                indexed.characters++;
              }
            } catch (e) {
              errors.push(`Character ${character.name}: ${e}`);
            }
          }
        }
        // Small delay between batches
        if (i + BATCH_SIZE < characters.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Reindex worldbuilding
      const worldbuilding = await this.getWorldbuilding(projectId);
      for (let i = 0; i < worldbuilding.length; i += BATCH_SIZE) {
        const batch = worldbuilding.slice(i, i + BATCH_SIZE);
        for (const element of batch) {
          const elem = element as {
            id: string;
            element_type: string;
            attributes: Record<string, unknown>;
            qdrant_id?: string;
          };
          if (!elem.qdrant_id) {
            try {
              const qdrantId = await this.qdrantMemory.storeWorldbuilding(
                projectId,
                elem.element_type,
                elem.attributes
              );
              if (qdrantId) {
                await this.saveWorldbuilding(
                  projectId,
                  elem.element_type,
                  elem.attributes,
                  qdrantId
                );
                indexed.worldbuilding++;
              }
            } catch (e) {
              errors.push(`Worldbuilding ${elem.element_type}: ${e}`);
            }
          }
        }
        if (i + BATCH_SIZE < worldbuilding.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Reindex drafts
      const drafts = await this.getDrafts(projectId);
      for (let i = 0; i < drafts.length; i += BATCH_SIZE) {
        const batch = drafts.slice(i, i + BATCH_SIZE);
        for (const draft of batch) {
          if (!draft.qdrant_id) {
            try {
              const qdrantId = await this.qdrantMemory.storeScene(
                projectId,
                draft.scene_number,
                draft as Record<string, unknown>
              );
              if (qdrantId) {
                await this.saveDraft(projectId, draft, qdrantId);
                indexed.drafts++;
              }
            } catch (e) {
              errors.push(`Draft scene ${draft.scene_number}: ${e}`);
            }
          }
        }
        if (i + BATCH_SIZE < drafts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[SupabaseService] Reindexed project ${projectId}:`, indexed);
      if (errors.length > 0) {
        console.error(`[SupabaseService] Reindex errors:`, errors);
      }

      return { ...indexed, errors };
    } catch (error) {
      console.error(`[SupabaseService] Reindex project failed:`, error);
      throw new Error(`Failed to reindex project: ${error}`);
    }
  }
}
