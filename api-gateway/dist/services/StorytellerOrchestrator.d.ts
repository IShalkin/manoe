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
    private llmProvider;
    private redisStreams;
    private qdrantMemory;
    private langfuse;
    private supabase;
    private agentFactory;
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
     */
    private runDraftingLoop;
    /**
     * Draft a single scene
     */
    private draftScene;
    /**
     * Critique a scene
     */
    private critiqueScene;
    /**
     * Revise a scene based on critique
     */
    private reviseScene;
    /**
     * Polish a scene (final refinement)
     */
    private polishScene;
    /**
     * Run Archivist to consolidate constraints
     */
    private runArchivistCheck;
    /**
     * Extract raw facts from generated content
     */
    private extractRawFacts;
    /**
     * Build constraints block for prompts
     */
    private buildConstraintsBlock;
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