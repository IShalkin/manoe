/**
 * Storyteller Orchestrator Service
 * Main multi-agent orchestration engine for MANOE narrative generation
 *
 * Implements:
 * - 9 specialized agents (Architect, Profiler, Worldbuilder, Strategist, Writer, Critic, Originality, Impact, Archivist)
 * - Phase-based generation flow (Genesis → Characters → Worldbuilding → Outlining → Drafting → Polish)
 * - Writer↔Critic revision loop with max 2 iterations
 * - Key Constraints for continuity (prevents context drift)
 * - Archivist agent for constraint resolution
 * - Real-time SSE event streaming
 * - Langfuse tracing and Prompt Management
 */
import { GenerationPhase, LLMProvider } from "../models/LLMModels";
import { GenerationState } from "../models/AgentModels";
/**
 * LLM Configuration for generation
 */
export interface LLMConfiguration {
    provider: LLMProvider;
    model: string;
    apiKey: string;
    temperature?: number;
}
/**
 * Generation options
 */
export interface GenerationOptions {
    projectId: string;
    seedIdea: string;
    llmConfig: LLMConfiguration;
    mode: "full" | "branching";
    settings?: Record<string, unknown>;
    /** Embedding API key for WorldBibleEmbeddingService (Gemini API key) */
    embeddingApiKey?: string;
}
/**
 * Run status
 */
export interface RunStatus {
    runId: string;
    projectId: string;
    phase: GenerationPhase;
    currentScene: number;
    totalScenes: number;
    isPaused: boolean;
    isCompleted: boolean;
    error?: string;
    startedAt: string;
    updatedAt: string;
}
export declare class StorytellerOrchestrator {
    private activeRuns;
    private pauseCallbacks;
    private isShuttingDown;
    private evaluationRateLimiter;
    private llmProvider;
    private redisStreams;
    private qdrantMemory;
    private langfuse;
    private supabase;
    private metricsService;
    private agentFactory;
    private evaluationService;
    private worldBibleEmbedding;
    /**
     * Start a new generation run
     *
     * @param options - Generation options including project ID, seed idea, and LLM config
     * @returns Run ID
     */
    startGeneration(options: GenerationOptions): Promise<string>;
    /**
     * Main generation loop
     */
    private runGeneration;
    /**
     * Genesis Phase - Initial story concept
     */
    private runGenesisPhase;
    /**
     * Add immutable seed constraints from Genesis phase
     * These constraints have sceneNumber=0 and are never overwritten by Archivist
     * Prevents context drift where LLM "forgets" the original story concept
     */
    private addSeedConstraints;
    /**
     * Extract string value from a field that might be string or object
     * Handles cases where LLM returns {name: "...", description: "..."} instead of plain string
     * Prevents [object Object] serialization issues in constraints
     */
    private extractStringValue;
    /**
     * Characters Phase - Character creation
     */
    private runCharactersPhase;
    /**
     * Worldbuilding Phase - Setting and world details
     */
    private runWorldbuildingPhase;
    /**
     * Outlining Phase - Scene-by-scene outline
     */
    private runOutliningPhase;
    /**
     * Advanced Planning Phase - Detailed planning with motifs and subtext
     */
    private runAdvancedPlanningPhase;
    /**
     * Drafting Loop - Draft, Critique, Revise for each scene
     *
     * Key improvements:
     * 1. Proactive Beats Method for scenes > 1000 target words (split into 3-4 parts upfront)
     * 2. Word count validation with expansion loop before Critic (for shorter scenes)
     * 3. Polish only runs if scene was approved (not after failed revisions)
     * 4. Strips fake "Word count:" claims from Writer output
     */
    private runDraftingLoop;
    /**
     * Draft a single scene
     */
    private draftScene;
    /**
     * Draft a scene using the Proactive Beats Method
     * Splits the scene into 3-4 parts and generates each sequentially
     * This prevents the Writer↔Critic deadlock where LLMs can't produce 1500+ words in one shot
     *
     * @param targetWordCount - Total target word count for the scene
     */
    private draftSceneWithBeats;
    /**
     * Critique a scene
     */
    private critiqueScene;
    /**
     * Revise a scene based on critique
     */
    private reviseScene;
    /**
     * Expand a scene by continuing from where it left off
     * Used when scene is too short before calling Critic
     * This prevents the Critic↔Writer deadlock
     *
     * @param sceneOutline - The original scene outline (passed explicitly to prevent state contamination)
     */
    private expandScene;
    /**
     * Strip fake "Word count: X" claims from Writer output
     * LLMs hallucinate word counts - we compute them programmatically instead
     */
    private stripFakeWordCount;
    /**
     * Strip overlap from continuation if Writer returned full text instead of just continuation
     * This prevents text duplication when LLM ignores the "return only continuation" instruction
     *
     * Algorithm: Find the longest suffix of existingContent that matches a prefix of continuation,
     * then strip that overlap from continuation.
     */
    private stripOverlap;
    /**
     * Polish a scene (final refinement)
     *
     * CRITICAL: Includes post-polish validation to prevent chunk loss
     * If polished version is significantly shorter or missing ending, falls back to pre-polish draft
     */
    private polishScene;
    /**
     * Emit scene_polish_complete event when Polish is skipped
     * This ensures frontend always has a canonical source of truth for each scene
     * Without this, frontend falls back to collecting all Writer messages which causes duplication
     */
    private emitSceneFinal;
    /**
     * Validate polish output to prevent chunk loss and lazy polish notes
     * Returns true if polish is acceptable, false if we should fall back to pre-polish draft
     */
    private validatePolishOutput;
    /**
     * Run Archivist to consolidate constraints
     */
    private runArchivistCheck;
    /**
     * Extract raw facts from generated content and emit to frontend
     * Uses canonical character names from state.characters as allowlist
     */
    private extractRawFacts;
    /**
     * Build constraints block for prompts
     */
    private buildConstraintsBlock;
    /**
     * Retrieve relevant context from Qdrant for hallucination prevention
     *
     * This method searches Qdrant for relevant characters, worldbuilding elements,
     * and previous scenes that are semantically related to the current scene.
     * The retrieved context helps the Writer maintain consistency with established facts.
     *
     * @param projectId - Project ID for filtering
     * @param sceneOutline - Current scene outline to use as search query
     * @returns Formatted context string for inclusion in Writer prompt
     */
    private getRelevantContext;
    /**
     * Call an agent with LLM
     */
    private callAgent;
    /**
     * Get agent prompt from Langfuse or fallback
     */
    private getAgentPrompt;
    /**
     * Get fallback prompt for agent
     */
    private getFallbackPrompt;
    /**
     * Compile fallback prompt with variables
     */
    private compileFallbackPrompt;
    /**
     * Check if critique approves the scene
     * Uses revision_needed flag from CriticAgent output
     */
    private isApproved;
    /**
     * Publish event to Redis Streams
     */
    private publishEvent;
    /**
     * Publish phase start event
     */
    private publishPhaseStart;
    /**
     * Publish phase complete event
     */
    private publishPhaseComplete;
    /**
     * Save artifact to Supabase
     */
    private saveArtifact;
    /**
     * Handle generation error
     *
     * IMPORTANT: Publishes ERROR event to Redis Stream so clients don't hang forever
     * Client should check for event.type === "ERROR" and stop waiting
     */
    private handleError;
    /**
     * Check if generation should stop
     */
    private shouldStop;
    /**
     * Parse JSON from LLM response
     */
    private parseJSON;
    /**
     * Parse JSON array from LLM response
     */
    private parseJSONArray;
    /**
     * Get run status
     */
    getRunStatus(runId: string): RunStatus | null;
    /**
     * Get full run state (for recovery)
     */
    getRunState(runId: string): GenerationState | null;
    /**
     * Pause a run
     */
    pauseRun(runId: string): boolean;
    /**
     * Resume a run
     */
    resumeRun(runId: string): boolean;
    /**
     * Cancel a run
     */
    cancelRun(runId: string): boolean;
    /**
     * Restore a run from saved state
     */
    restoreRun(state: GenerationState): void;
    /**
     * List active runs
     */
    listActiveRuns(): RunStatus[];
    /**
     * Initiate graceful shutdown
     *
     * Pauses all active runs and saves their state to Supabase.
     * When the service restarts, runs can be restored using restoreRun().
     *
     * @param timeoutMs - Maximum time to wait for runs to pause (default: 30s)
     * @returns Number of runs that were saved
     */
    gracefulShutdown(timeoutMs?: number): Promise<number>;
    /**
     * Restore runs from saved state after restart
     *
     * Call this on service startup to recover any runs that were
     * interrupted by a shutdown/restart.
     *
     * @param runId - Optional: restore a specific run by ID
     * @returns Number of runs restored
     */
    restoreFromShutdown(runId?: string): Promise<number>;
    /**
     * Restore ALL interrupted runs from saved state after restart
     *
     * Call this on service startup to recover any runs that were
     * interrupted by a shutdown/restart.
     *
     * @returns Number of runs restored
     */
    restoreAllInterruptedRuns(): Promise<number>;
    /**
     * Check if shutdown is in progress
     */
    get shuttingDown(): boolean;
}
//# sourceMappingURL=StorytellerOrchestrator.d.ts.map