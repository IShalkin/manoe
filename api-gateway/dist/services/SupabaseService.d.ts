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
export interface Outline {
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
    narrative_content: string;
    title?: string;
    word_count?: number;
    sensory_details?: unknown;
    subtext_layer?: string;
    emotional_shift?: string;
    status: string;
    revision_count: number;
    semantic_check_error?: string;
    contradiction_score?: number;
    created_at: string;
}
export interface AuditLog {
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
export interface Worldbuilding {
    id: string;
    project_id: string;
    element_type: string;
    name: string;
    description: string;
    attributes?: unknown;
    qdrant_id?: string;
    created_at: string;
}
export interface Critique {
    id: string;
    project_id: string;
    scene_number: number;
    overall_score: number;
    approved: boolean;
    feedback_items?: unknown[];
    strengths?: unknown;
    weaknesses?: unknown;
    revision_required?: boolean;
    revision_focus?: unknown;
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
    citations?: Array<{
        url: string;
        title?: string;
    }>;
    created_at: string;
}
export declare class SupabaseService {
    private client;
    private langfuse;
    private metricsService;
    constructor();
    private connect;
    private getClient;
    healthCheck(): Promise<boolean>;
    createProject(data: Partial<Project>): Promise<Project>;
    getProject(id: string): Promise<Project | null>;
    updateProjectStatus(id: string, status: string): Promise<void>;
    listProjects(page?: number, limit?: number): Promise<{
        projects: Project[];
        total: number;
    }>;
    deleteProject(id: string): Promise<void>;
    getNarrativePossibility(projectId: string): Promise<unknown | null>;
    saveNarrativePossibility(projectId: string, narrative: unknown): Promise<void>;
    getCharacters(projectId: string): Promise<Character[]>;
    saveCharacter(projectId: string, character: Partial<Character>, qdrantId?: string, runId?: string): Promise<Character>;
    getWorldbuilding(projectId: string, elementType?: string): Promise<Worldbuilding[]>;
    saveWorldbuilding(projectId: string, elementType: string, element: Record<string, unknown>, qdrantId?: string, runId?: string): Promise<unknown>;
    getOutline(projectId: string): Promise<Outline | null>;
    saveOutline(projectId: string, outline: Partial<Outline>): Promise<void>;
    getDrafts(projectId: string): Promise<Draft[]>;
    getDraftBySceneNumber(projectId: string, sceneNumber: number): Promise<Draft | null>;
    saveDraft(projectId: string, draft: Partial<Draft> & Record<string, unknown>, qdrantId?: string, runId?: string): Promise<Draft>;
    getCritiques(projectId: string): Promise<Critique[]>;
    /**
     * Save a critique for a scene
     * Phase 5.1: Integrate write-path for critiques table
     */
    saveCritique(params: {
        projectId: string;
        runId: string;
        sceneNumber: number;
        critique: Record<string, unknown>;
        revisionNumber: number;
    }): Promise<void>;
    /**
     * Upsert characters for a project
     * Phase 5.1: Integrate write-path for characters table
     */
    upsertCharacters(projectId: string, runId: string, characters: Record<string, unknown>[]): Promise<void>;
    /**
     * Upsert a draft for a scene
     * Phase 5.1: Integrate write-path for drafts table
     */
    upsertDraft(params: {
        projectId: string;
        runId: string;
        sceneNumber: number;
        content: string;
        wordCount: number;
        status: string;
        revisionCount: number;
        semanticCheckError?: string;
        contradictionScore?: number;
    }): Promise<void>;
    getAuditLogs(projectId: string, agentName?: string, limit?: number): Promise<AuditLog[]>;
    saveAuditLog(log: Partial<AuditLog>): Promise<void>;
    /**
     * Save a run artifact (narrative, characters, worldbuilding, outline, draft, etc.)
     */
    saveRunArtifact(params: {
        runId: string;
        projectId: string;
        artifactType: string;
        content: unknown;
        phase?: string;
    }): Promise<void>;
    /**
     * Derive phase from artifact type
     */
    private derivePhaseFromArtifactType;
    /**
     * Get run artifacts by run ID
     */
    getRunArtifacts(runId: string): Promise<unknown[]>;
    /**
     * Get a specific run artifact by type
     */
    getRunArtifact(runId: string, artifactType: string): Promise<unknown | null>;
    /**
     * Get research history for a user
     */
    getResearchHistory(limit?: number): Promise<ResearchHistoryItem[]>;
    /**
     * Get a specific research result by ID
     */
    getResearchResult(id: string): Promise<ResearchHistoryItem | null>;
    /**
     * Get all interrupted run state snapshots for recovery after restart
     * Returns runs that were saved during graceful shutdown and haven't been completed
     */
    getInterruptedRunSnapshots(): Promise<Array<{
        run_id: string;
        project_id: string;
        content: unknown;
    }>>;
    /**
     * Delete a run state snapshot after successful restoration or completion
     */
    deleteRunStateSnapshot(runId: string): Promise<void>;
    reindexProject(projectId: string): Promise<{
        characters: number;
        worldbuilding: number;
        drafts: number;
        errors: string[];
    }>;
}
export {};
//# sourceMappingURL=SupabaseService.d.ts.map