import { Service, Inject } from "@tsed/di";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { LangfuseService } from "./LangfuseService";
import { MetricsService } from "./MetricsService";
import {
  SupabaseCharacterSchema,
  SupabaseWorldbuildingSchema,
  SupabaseDraftSchema,
} from "../schemas/SupabaseSchemas";

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

export interface Character {
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

export interface Draft {
  id: string;
  project_id: string;
  scene_number: number;
  content: string;
  sensory_details?: unknown;
  subtext_layer?: string;
  emotional_shift?: string;
  status: string;
  revision_count: number;
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
  private langfuse!: LangfuseService;

  @Inject()
  private metricsService!: MetricsService;

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
    const startTime = Date.now();
    const client = this.getClient();
    const { data: project, error } = await client
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        this.metricsService.recordDatabaseQuery({
          operation: "select",
          table: "projects",
          durationMs: Date.now() - startTime,
          success: true,
        });
        return null;
      }
      this.metricsService.recordDatabaseQuery({
        operation: "select",
        table: "projects",
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw new Error(`Failed to get project: ${error.message}`);
    }

    this.metricsService.recordDatabaseQuery({
      operation: "select",
      table: "projects",
      durationMs: Date.now() - startTime,
      success: true,
    });

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
  // Character Operations
  // ========================================================================

  async getCharacters(projectId: string): Promise<Character[]> {
    const startTime = Date.now();
    const client = this.getClient();
    const { data: characters, error } = await client
      .from("characters")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      this.metricsService.recordDatabaseQuery({
        operation: "select",
        table: "characters",
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw new Error(`Failed to get characters: ${error.message}`);
    }

    this.metricsService.recordDatabaseQuery({
      operation: "select",
      table: "characters",
      durationMs: Date.now() - startTime,
      success: true,
    });

    return characters || [];
  }

  async saveCharacter(
    projectId: string,
    character: Partial<Character>,
    qdrantId?: string,
    runId?: string
  ): Promise<Character> {
    const startTime = Date.now();
    const client = this.getClient();
    const { normalizeCharacterForStorage } = await import("../utils/schemaNormalizers");
    const { camelToSnakeCase } = await import("../utils/stringUtils");

    // Normalize LLM field names to DB field names and stringify objects
    const normalizedChar = normalizeCharacterForStorage(character as Record<string, unknown>);
    const snakeCaseChar = camelToSnakeCase(normalizedChar);

    const insertData = {
      project_id: projectId,
      ...snakeCaseChar,
      qdrant_id: qdrantId,
      created_at: new Date().toISOString(),
    };

    // Validate data against Zod schema before insert (strips unknown fields)
    const validationResult = SupabaseCharacterSchema.safeParse(insertData);
    if (!validationResult.success) {
      const characterName = (snakeCaseChar as Record<string, unknown>).name as string || character.name || 'Unknown';
      const errorSummary = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      console.error('[SupabaseService] Character validation failed:', errorSummary);
      
      if (runId) {
        this.langfuse.addEvent(runId, 'supabase_character_validation_error', {
          projectId,
          characterName,
          validationErrors: validationResult.error.errors,
        });
      }
      
      throw new Error(`Character validation failed: ${errorSummary}`);
    }

    // Use validated data (with unknown fields stripped)
    const validatedData = validationResult.data;

    console.log('[SupabaseService] Attempting to save character:', JSON.stringify(validatedData, null, 2));

    const { data, error, status, statusText } = await client
      .from("characters")
      .insert(validatedData)
      .select();

    console.log('[SupabaseService] Insert response - status:', status, 'statusText:', statusText, 'dataLength:', data?.length, 'error:', JSON.stringify(error));

    // Get character name for logging (from normalized data or original)
    const characterName = (snakeCaseChar as Record<string, unknown>).name as string || character.name || 'Unknown';

    if (error) {
      console.error('[SupabaseService] Failed to save character - code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint);
      
      // Record failed database query metrics
      this.metricsService.recordDatabaseQuery({
        operation: "insert",
        table: "characters",
        durationMs: Date.now() - startTime,
        success: false,
      });
      
      // Log validation/storage error to Langfuse for observability
      if (runId) {
        this.langfuse.addEvent(runId, 'supabase_character_save_error', {
          projectId,
          characterName,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
        });
      }
      
      throw new Error(`Failed to save character: ${error.message || error.code || 'Unknown error'}`);
    }

    if (!data || data.length === 0) {
      console.error('[SupabaseService] No data returned from insert despite no error');
      
      if (runId) {
        this.langfuse.addEvent(runId, 'supabase_character_save_error', {
          projectId,
          characterName,
          errorMessage: 'No data returned from insert',
        });
      }
      
      throw new Error('Failed to save character: No data returned');
    }

    // Record successful database query metrics
    this.metricsService.recordDatabaseQuery({
      operation: "insert",
      table: "characters",
      durationMs: Date.now() - startTime,
      success: true,
    });

    // Log successful save to Langfuse
    if (runId) {
      this.langfuse.addEvent(runId, 'supabase_character_saved', {
        projectId,
        characterId: data[0].id,
        characterName: data[0].name,
        qdrantId: qdrantId || null,
      });
    }

    console.log('[SupabaseService] Character saved successfully with qdrant_id:', qdrantId || 'N/A');
    return data[0];
  }

  // ========================================================================
  // Worldbuilding Operations
  // ========================================================================

  async getWorldbuilding(
    projectId: string,
    elementType?: string
  ): Promise<unknown[]> {
    const startTime = Date.now();
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
      this.metricsService.recordDatabaseQuery({
        operation: "select",
        table: "worldbuilding",
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw new Error(`Failed to get worldbuilding: ${error.message}`);
    }

    this.metricsService.recordDatabaseQuery({
      operation: "select",
      table: "worldbuilding",
      durationMs: Date.now() - startTime,
      success: true,
    });

    return data || [];
  }

  async saveWorldbuilding(
    projectId: string,
    elementType: string,
    element: Record<string, unknown>,
    qdrantId?: string,
    runId?: string
  ): Promise<unknown> {
    const client = this.getClient();
    
    // Extract description from element - handle various LLM output formats
    // LLMs may return description as string, object, or omit it entirely
    let description = '';
    if (typeof element.description === 'string' && element.description.trim()) {
      description = element.description;
    } else if (typeof element.description === 'object' && element.description !== null) {
      description = JSON.stringify(element.description);
    } else if (typeof element.summary === 'string' && element.summary.trim()) {
      // Fallback to summary field if description is missing
      description = element.summary;
    } else if (typeof element.details === 'string' && element.details.trim()) {
      // Fallback to details field if description is missing
      description = element.details;
    } else {
      // Last resort: stringify the entire element as description
      // This ensures we always have a non-empty description for validation
      const { name, ...rest } = element;
      description = Object.keys(rest).length > 0 ? JSON.stringify(rest) : `${elementType} element`;
    }

    const insertData = {
      project_id: projectId,
      element_type: elementType,
      name: element.name || elementType,
      description,
      attributes: element,
      qdrant_id: qdrantId,
      created_at: new Date().toISOString(),
    };

    // Validate data against Zod schema before insert (strips unknown fields)
    const validationResult = SupabaseWorldbuildingSchema.safeParse(insertData);
    if (!validationResult.success) {
      const errorSummary = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      console.error('[SupabaseService] Worldbuilding validation failed:', errorSummary);
      
      if (runId) {
        this.langfuse.addEvent(runId, 'supabase_worldbuilding_validation_error', {
          projectId,
          elementType,
          elementName: insertData.name,
          validationErrors: validationResult.error.errors,
        });
      }
      
      throw new Error(`Worldbuilding validation failed: ${errorSummary}`);
    }

    // Use validated data (with unknown fields stripped)
    const validatedData = validationResult.data;

    console.log('[SupabaseService] Attempting to save worldbuilding:', elementType);

    const { data, error, status } = await client
      .from("worldbuilding")
      .insert(validatedData)
      .select();

    console.log('[SupabaseService] Worldbuilding insert response - status:', status, 'error:', JSON.stringify(error));

    if (error) {
      console.error('[SupabaseService] Failed to save worldbuilding (' + elementType + '):', error.message);
      
      // Log error to Langfuse for observability
      if (runId) {
        this.langfuse.addEvent(runId, 'supabase_worldbuilding_save_error', {
          projectId,
          elementType,
          elementName: insertData.name,
          errorCode: error.code,
          errorMessage: error.message,
        });
      }
      
      throw new Error(`Failed to save worldbuilding: ${error.message || 'Unknown error'}`);
    }

    // Log successful save to Langfuse
    if (runId) {
      this.langfuse.addEvent(runId, 'supabase_worldbuilding_saved', {
        projectId,
        elementType,
        elementName: insertData.name,
        qdrantId: qdrantId || null,
      });
    }

    console.log('[SupabaseService] Worldbuilding saved successfully:', elementType);
    return data?.[0];
  }


  // ========================================================================
  // Outline Operations
  // ========================================================================

  async getOutline(projectId: string): Promise<Outline | null> {
    const startTime = Date.now();
    const client = this.getClient();
    const { data, error } = await client
      .from("outlines")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        this.metricsService.recordDatabaseQuery({
          operation: "select",
          table: "outlines",
          durationMs: Date.now() - startTime,
          success: true,
        });
        return null;
      }
      this.metricsService.recordDatabaseQuery({
        operation: "select",
        table: "outlines",
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw new Error(`Failed to get outline: ${error.message}`);
    }

    this.metricsService.recordDatabaseQuery({
      operation: "select",
      table: "outlines",
      durationMs: Date.now() - startTime,
      success: true,
    });

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
    const startTime = Date.now();
    const client = this.getClient();
    const { data: drafts, error } = await client
      .from("drafts")
      .select("*")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true });

    if (error) {
      this.metricsService.recordDatabaseQuery({
        operation: "select",
        table: "drafts",
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw new Error(`Failed to get drafts: ${error.message}`);
    }

    this.metricsService.recordDatabaseQuery({
      operation: "select",
      table: "drafts",
      durationMs: Date.now() - startTime,
      success: true,
    });

    return drafts || [];
  }

  async saveDraft(
    projectId: string,
    draft: Partial<Draft> & Record<string, unknown>,
    qdrantId?: string,
    runId?: string
  ): Promise<Draft> {
    const client = this.getClient();
    
    // Normalize field names from orchestrator format to DB schema format
    // The orchestrator uses camelCase (sceneNum, content, wordCount)
    // but the DB schema uses snake_case (scene_number, narrative_content, word_count)
    const sceneNumber = draft.scene_number ?? (draft as Record<string, unknown>).sceneNum as number | undefined;
    const narrativeContent = draft.content ?? (draft as Record<string, unknown>).content as string | undefined;
    const wordCount = draft.word_count ?? (draft as Record<string, unknown>).wordCount as number | undefined;
    const title = draft.title ?? (draft as Record<string, unknown>).title as string | undefined;
    
    const insertData = {
      project_id: projectId,
      scene_number: sceneNumber,
      narrative_content: narrativeContent,
      word_count: wordCount,
      title: title,
      status: draft.status || 'draft',
      revision_count: draft.revision_count || 0,
      sensory_details: draft.sensory_details,
      subtext_layer: draft.subtext_layer,
      emotional_shift: draft.emotional_shift,
      qdrant_id: qdrantId,
      created_at: new Date().toISOString(),
    };

    // Validate data against Zod schema before insert (strips unknown fields)
    const validationResult = SupabaseDraftSchema.safeParse(insertData);
    if (!validationResult.success) {
      const errorSummary = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      console.error('[SupabaseService] Draft validation failed:', errorSummary);
      
      if (runId) {
        this.langfuse.addEvent(runId, 'supabase_draft_validation_error', {
          projectId,
          sceneNumber: draft.scene_number,
          validationErrors: validationResult.error.errors,
        });
      }
      
      throw new Error(`Draft validation failed: ${errorSummary}`);
    }

    // Use validated data (with unknown fields stripped)
    const validatedData = validationResult.data;

    const { data, error } = await client
      .from("drafts")
      .upsert(validatedData)
      .select()
      .single();

    if (error) {
      console.error('[SupabaseService] Failed to save draft:', error.message);
      
      // Log error to Langfuse for observability
      if (runId) {
        this.langfuse.addEvent(runId, 'supabase_draft_save_error', {
          projectId,
          sceneNumber: draft.scene_number,
          errorCode: error.code,
          errorMessage: error.message,
        });
      }
      
      throw new Error(`Failed to save draft: ${error.message}`);
    }

    // Log successful save to Langfuse
    if (runId) {
      this.langfuse.addEvent(runId, 'supabase_draft_saved', {
        projectId,
        draftId: data.id,
        sceneNumber: data.scene_number,
        qdrantId: qdrantId || null,
      });
    }

    return data;
  }

  // ========================================================================
  // Critique Operations
  // ========================================================================

  async getCritiques(projectId: string): Promise<unknown[]> {
    const startTime = Date.now();
    const client = this.getClient();
    const { data, error } = await client
      .from("critiques")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      this.metricsService.recordDatabaseQuery({
        operation: "select",
        table: "critiques",
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw new Error(`Failed to get critiques: ${error.message}`);
    }

    this.metricsService.recordDatabaseQuery({
      operation: "select",
      table: "critiques",
      durationMs: Date.now() - startTime,
      success: true,
    });

    return data || [];
  }

  /**
   * Save a critique for a scene
   * Phase 5.1: Integrate write-path for critiques table
   */
  async saveCritique(params: {
    projectId: string;
    runId: string;
    sceneNumber: number;
    critique: Record<string, unknown>;
    revisionNumber: number;
  }): Promise<void> {
    const client = this.getClient();
    // Map to actual table schema
    const { error } = await client.from("critiques").insert({
      project_id: params.projectId,
      scene_number: params.sceneNumber,
      overall_score: params.critique.score ?? 5,
      approved: params.critique.approved ?? false,
      feedback_items: params.critique.issues || [],
      strengths: params.critique.strengths,
      weaknesses: params.critique.issues,
      revision_required: params.critique.revision_needed ?? true,
      revision_focus: params.critique.revisionRequests,
    });

    if (error) {
      // Log but don't throw - critique persistence is not critical path
      console.error(`Failed to save critique: ${error.message}`);
    }
  }

  /**
   * Upsert characters for a project
   * Phase 5.1: Integrate write-path for characters table
   */
  async upsertCharacters(
    projectId: string,
    runId: string,
    characters: Record<string, unknown>[]
  ): Promise<void> {
    const client = this.getClient();
    
    for (const char of characters) {
      // Map character fields to actual table schema columns
      const { error } = await client.from("characters").upsert({
        project_id: projectId,
        name: String(char.name || char.fullName || "Unknown"),
        archetype: char.archetype || char.role,
        core_motivation: char.coreMotivation || char.motivation,
        inner_trap: char.innerTrap || char.flaw,
        psychological_wound: char.psychologicalWound || char.wound,
        visual_signature: char.visualSignature || char.appearance,
        // Map additional fields to table columns
        coping_mechanism: char.copingMechanism,
        deepest_fear: char.deepestFear,
        breaking_point: char.breakingPoint,
        occupation_role: char.occupationRole || char.occupation || char.role,
        public_goal: char.publicGoal,
        hidden_goal: char.hiddenGoal,
        defining_moment: char.definingMoment,
        family_background: char.familyBackground,
        special_skill: char.specialSkill,
        moral_stance: char.moralStance,
        potential_arc: char.potentialArc || char.arc,
      }, {
        onConflict: "project_id,name",
      });

      if (error) {
        console.error(`Failed to upsert character ${char.name}: ${error.message}`);
      }
    }
  }

  /**
   * Upsert a draft for a scene
   * Phase 5.1: Integrate write-path for drafts table
   */
  async upsertDraft(params: {
    projectId: string;
    runId: string;
    sceneNumber: number;
    content: string;
    wordCount: number;
    status: string;
    revisionCount: number;
  }): Promise<void> {
    const client = this.getClient();
    // Map to actual table schema - uses narrative_content instead of content
    const { error } = await client.from("drafts").upsert({
      project_id: params.projectId,
      scene_number: params.sceneNumber,
      narrative_content: params.content,
      word_count: params.wordCount,
      status: params.status,
      revision_count: params.revisionCount,
    }, {
      onConflict: "project_id,scene_number",
    });

    if (error) {
      console.error(`Failed to upsert draft: ${error.message}`);
    }
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
    const startTime = Date.now();
    const client = this.getClient();
    const { data, error } = await client
      .from("run_artifacts")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (error) {
      this.metricsService.recordDatabaseQuery({
        operation: "select",
        table: "run_artifacts",
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw new Error(`Failed to get run artifacts: ${error.message}`);
    }

    this.metricsService.recordDatabaseQuery({
      operation: "select",
      table: "run_artifacts",
      durationMs: Date.now() - startTime,
      success: true,
    });

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

  async reindexProject(projectId: string): Promise<{ characters: number; worldbuilding: number; drafts: number; errors: string[] }> {
    const errors: string[] = [];
    let characters = 0;
    let worldbuilding = 0;
    let drafts = 0;

    try {
      const charData = await this.getCharacters(projectId);
      characters = charData.length;
    } catch (e) {
      errors.push(`Failed to get characters: ${e}`);
    }

    try {
      const wbData = await this.getWorldbuilding(projectId);
      worldbuilding = wbData.length;
    } catch (e) {
      errors.push(`Failed to get worldbuilding: ${e}`);
    }

    try {
      const draftData = await this.getDrafts(projectId);
      drafts = draftData.length;
    } catch (e) {
      errors.push(`Failed to get drafts: ${e}`);
    }

    return { characters, worldbuilding, drafts, errors };
  }
}
