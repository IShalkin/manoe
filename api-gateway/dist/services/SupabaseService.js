"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const di_1 = require("@tsed/di");
const supabase_js_1 = require("@supabase/supabase-js");
let SupabaseService = class SupabaseService {
    client = null;
    constructor() {
        this.connect();
    }
    connect() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;
        if (!supabaseUrl || !supabaseKey) {
            console.warn("Supabase credentials not configured");
            return;
        }
        this.client = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
        console.log("Connected to Supabase");
    }
    getClient() {
        if (!this.client) {
            throw new Error("Supabase client not initialized");
        }
        return this.client;
    }
    async healthCheck() {
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
    async createProject(data) {
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
    async getProject(id) {
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
    async updateProjectStatus(id, status) {
        const client = this.getClient();
        const { error } = await client
            .from("projects")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", id);
        if (error) {
            throw new Error(`Failed to update project status: ${error.message}`);
        }
    }
    async listProjects(page = 1, limit = 10) {
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
    async deleteProject(id) {
        const client = this.getClient();
        const { error } = await client.from("projects").delete().eq("id", id);
        if (error) {
            throw new Error(`Failed to delete project: ${error.message}`);
        }
    }
    // ========================================================================
    // Narrative Possibility Operations
    // ========================================================================
    async getNarrativePossibility(projectId) {
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
    async saveNarrativePossibility(projectId, narrative) {
        const client = this.getClient();
        const { error } = await client.from("narrative_possibilities").upsert({
            project_id: projectId,
            ...narrative,
            created_at: new Date().toISOString(),
        });
        if (error) {
            throw new Error(`Failed to save narrative possibility: ${error.message}`);
        }
    }
    // ========================================================================
    // Character Operations
    // ========================================================================
    async getCharacters(projectId) {
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
    async saveCharacter(projectId, character) {
        const client = this.getClient();
        const { data, error } = await client
            .from("characters")
            .insert({
            project_id: projectId,
            ...character,
            created_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error) {
            throw new Error(`Failed to save character: ${error.message}`);
        }
        return data;
    }
    // ========================================================================
    // Worldbuilding Operations
    // ========================================================================
    async getWorldbuilding(projectId, elementType) {
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
    // ========================================================================
    // Outline Operations
    // ========================================================================
    async getOutline(projectId) {
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
    async saveOutline(projectId, outline) {
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
    async getDrafts(projectId) {
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
    async saveDraft(projectId, draft) {
        const client = this.getClient();
        const { data, error } = await client
            .from("drafts")
            .upsert({
            project_id: projectId,
            ...draft,
            created_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error) {
            throw new Error(`Failed to save draft: ${error.message}`);
        }
        return data;
    }
    // ========================================================================
    // Critique Operations
    // ========================================================================
    async getCritiques(projectId) {
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
    async getAuditLogs(projectId, agentName, limit = 50) {
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
    async saveAuditLog(log) {
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
    async saveRunArtifact(params) {
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
    derivePhaseFromArtifactType(artifactType) {
        if (artifactType === "narrative")
            return "genesis";
        if (artifactType === "characters")
            return "characters";
        if (artifactType === "worldbuilding")
            return "worldbuilding";
        if (artifactType === "outline")
            return "outlining";
        if (artifactType === "advanced_plan")
            return "advanced_planning";
        if (artifactType.startsWith("draft_scene_"))
            return "drafting";
        if (artifactType.startsWith("critique_scene_"))
            return "drafting";
        if (artifactType.startsWith("revision_scene_"))
            return "drafting";
        if (artifactType.startsWith("final_scene_"))
            return "polish";
        if (artifactType === "run_state_snapshot")
            return "snapshot";
        return "unknown";
    }
    /**
     * Get run artifacts by run ID
     */
    async getRunArtifacts(runId) {
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
    async getRunArtifact(runId, artifactType) {
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
    async getResearchHistory(limit = 20) {
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
    async getResearchResult(id) {
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
};
exports.SupabaseService = SupabaseService;
exports.SupabaseService = SupabaseService = __decorate([
    (0, di_1.Service)(),
    __metadata("design:paramtypes", [])
], SupabaseService);
//# sourceMappingURL=SupabaseService.js.map