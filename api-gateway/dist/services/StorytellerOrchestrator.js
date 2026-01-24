"use strict";
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
exports.StorytellerOrchestrator = void 0;
const di_1 = require("@tsed/di");
const common_1 = require("@tsed/common");
const uuid_1 = require("uuid");
const LLMModels_1 = require("../models/LLMModels");
const AgentModels_1 = require("../models/AgentModels");
const LLMProviderService_1 = require("./LLMProviderService");
const RedisStreamsService_1 = require("./RedisStreamsService");
const QdrantMemoryService_1 = require("./QdrantMemoryService");
const LangfuseService_1 = require("./LangfuseService");
const SupabaseService_1 = require("./SupabaseService");
const MetricsService_1 = require("./MetricsService");
const AgentFactory_1 = require("../agents/AgentFactory");
const schemaNormalizers_1 = require("../utils/schemaNormalizers");
const EvaluationService_1 = require("./EvaluationService");
const WorldBibleEmbeddingService_1 = require("./WorldBibleEmbeddingService");
/**
 * Simple rate limiter for concurrent async operations
 * Limits the number of concurrent promises to avoid hitting API rate limits
 */
function createRateLimiter(concurrency) {
    let activeCount = 0;
    const queue = [];
    const next = () => {
        if (queue.length > 0 && activeCount < concurrency) {
            activeCount++;
            const resolve = queue.shift();
            resolve();
        }
    };
    return (fn) => {
        return new Promise((resolve, reject) => {
            const run = () => {
                fn()
                    .then(resolve)
                    .catch(reject)
                    .finally(() => {
                    activeCount--;
                    next();
                });
            };
            if (activeCount < concurrency) {
                activeCount++;
                run();
            }
            else {
                queue.push(run);
            }
        });
    };
}
let StorytellerOrchestrator = class StorytellerOrchestrator {
    activeRuns = new Map();
    pauseCallbacks = new Map();
    isShuttingDown = false;
    // Shared rate limiter for all evaluation calls (max 3 concurrent)
    // This ensures consistent rate limiting across relevance and faithfulness evaluations
    evaluationRateLimiter = createRateLimiter(3);
    llmProvider;
    redisStreams;
    qdrantMemory;
    langfuse;
    supabase;
    metricsService;
    agentFactory;
    evaluationService;
    worldBibleEmbedding;
    /**
     * Start a new generation run
     *
     * @param options - Generation options including project ID, seed idea, and LLM config
     * @returns Run ID
     */
    async startGeneration(options) {
        const runId = (0, uuid_1.v4)();
        process.stdout.write(`[StorytellerOrchestrator] startGeneration called, runId: ${runId}, projectId: ${options.projectId}\n`);
        common_1.$log.info(`[StorytellerOrchestrator] startGeneration called, runId: ${runId}, projectId: ${options.projectId}`);
        // Initialize generation state
        const state = {
            phase: LLMModels_1.GenerationPhase.GENESIS,
            projectId: options.projectId,
            runId,
            characters: [],
            currentScene: 0,
            totalScenes: 0,
            drafts: new Map(),
            critiques: new Map(),
            revisionCount: new Map(),
            messages: [],
            maxRevisions: 2,
            keyConstraints: [],
            rawFactsLog: [],
            lastArchivistScene: 0,
            isPaused: false,
            isCompleted: false,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        this.activeRuns.set(runId, state);
        common_1.$log.info(`[StorytellerOrchestrator] startGeneration: state initialized and stored, runId: ${runId}`);
        // Embedding API Key Resolution (in priority order):
        // 1. Dedicated embedding API key from frontend settings (always treated as Gemini key)
        // 2. LLM provider key (only if provider is Gemini or OpenAI)
        // 
        // Why Gemini is preferred: Gemini embeddings are free and high-quality (768 dimensions).
        // This allows users to use OpenAI for LLM generation while using free Gemini for embeddings.
        // 
        // If no embedding key is available, semantic consistency checking will be DISABLED
        // but the service will still connect to Qdrant for other operations.
        let geminiApiKey;
        let openaiApiKey;
        let embeddingSource;
        if (options.embeddingApiKey) {
            // Priority 1: Use dedicated embedding API key (always Gemini)
            geminiApiKey = options.embeddingApiKey;
            embeddingSource = "dedicated Gemini key";
        }
        else if (options.llmConfig.provider === LLMModels_1.LLMProvider.GEMINI) {
            // Priority 2: Reuse LLM Gemini key for embeddings
            geminiApiKey = options.llmConfig.apiKey;
            embeddingSource = "LLM Gemini key";
        }
        else if (options.llmConfig.provider === LLMModels_1.LLMProvider.OPENAI) {
            // Priority 3: Use OpenAI key for embeddings (if no Gemini key available)
            openaiApiKey = options.llmConfig.apiKey;
            embeddingSource = "LLM OpenAI key";
        }
        else {
            // No embedding key available - semantic checks will be disabled
            embeddingSource = "none (semantic checks disabled)";
        }
        // Initialize Qdrant memory with resolved embedding API keys
        // IMPORTANT: Use the same resolved keys for both services to ensure consistent embedding dimensions
        await this.qdrantMemory.connect(openaiApiKey, geminiApiKey);
        // Initialize WorldBibleEmbeddingService for semantic consistency checking
        await this.worldBibleEmbedding.connect(openaiApiKey, geminiApiKey);
        common_1.$log.info(`[StorytellerOrchestrator] Embedding services initialized with: ${embeddingSource}, provider: ${this.worldBibleEmbedding.provider}`);
        // Start Langfuse trace
        this.langfuse.startTrace({
            projectId: options.projectId,
            runId,
            phase: LLMModels_1.GenerationPhase.GENESIS,
        });
        // Publish start event
        await this.publishEvent(runId, "generation_started", {
            projectId: options.projectId,
            mode: options.mode,
            phase: LLMModels_1.GenerationPhase.GENESIS,
        });
        // Start generation in background
        common_1.$log.info(`[StorytellerOrchestrator] startGeneration: starting async runGeneration, runId: ${runId}`);
        this.runGeneration(runId, options).catch((error) => {
            common_1.$log.error(`[StorytellerOrchestrator] startGeneration: runGeneration error, runId: ${runId}`, error);
            this.handleError(runId, error);
        });
        return runId;
    }
    /**
     * Main generation loop
     */
    async runGeneration(runId, options) {
        common_1.$log.info(`[StorytellerOrchestrator] runGeneration started, runId: ${runId}`);
        const state = this.activeRuns.get(runId);
        if (!state) {
            common_1.$log.error(`[StorytellerOrchestrator] runGeneration: state not found, runId: ${runId}`);
            return;
        }
        try {
            // Phase 1: Genesis
            common_1.$log.info(`[StorytellerOrchestrator] runGeneration: about to call runGenesisPhase, runId: ${runId}`);
            await this.runGenesisPhase(runId, options);
            common_1.$log.info(`[StorytellerOrchestrator] runGeneration: runGenesisPhase completed, runId: ${runId}`);
            const shouldStopAfterGenesis = this.shouldStop(runId);
            common_1.$log.info(`[StorytellerOrchestrator] runGeneration: shouldStop after Genesis = ${shouldStopAfterGenesis}, runId: ${runId}`);
            if (shouldStopAfterGenesis) {
                common_1.$log.info(`[StorytellerOrchestrator] runGeneration: shouldStop after Genesis, exiting, runId: ${runId}`);
                return;
            }
            // Phase 2: Characters
            common_1.$log.info(`[StorytellerOrchestrator] runGeneration: about to call runCharactersPhase, runId: ${runId}`);
            await this.runCharactersPhase(runId, options);
            common_1.$log.info(`[StorytellerOrchestrator] runGeneration: runCharactersPhase completed, runId: ${runId}`);
            if (this.shouldStop(runId))
                return;
            // Phase 3: Worldbuilding
            await this.runWorldbuildingPhase(runId, options);
            if (this.shouldStop(runId))
                return;
            // Phase 4: Outlining
            await this.runOutliningPhase(runId, options);
            if (this.shouldStop(runId))
                return;
            // Phase 5: Advanced Planning (optional)
            await this.runAdvancedPlanningPhase(runId, options);
            if (this.shouldStop(runId))
                return;
            // Phase 6-9: Drafting → Critique → Revision → Polish (per scene)
            await this.runDraftingLoop(runId, options);
            if (this.shouldStop(runId))
                return;
            // Mark as completed
            state.isCompleted = true;
            state.updatedAt = new Date().toISOString();
            await this.publishEvent(runId, "generation_complete", {
                projectId: options.projectId,
                totalScenes: state.totalScenes,
            });
            // End Langfuse trace
            this.langfuse.endTrace(runId, {
                status: "completed",
                totalScenes: state.totalScenes,
            });
        }
        catch (error) {
            await this.handleError(runId, error);
        }
    }
    /**
     * Genesis Phase - Initial story concept
     */
    async runGenesisPhase(runId, options) {
        common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase called, runId: ${runId}`);
        const state = this.activeRuns.get(runId);
        if (!state) {
            common_1.$log.error(`[StorytellerOrchestrator] runGenesisPhase: state not found for runId: ${runId}`);
            return;
        }
        state.phase = LLMModels_1.GenerationPhase.GENESIS;
        common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase: phase set to GENESIS, runId: ${runId}`);
        await this.publishPhaseStart(runId, LLMModels_1.GenerationPhase.GENESIS);
        // Use ArchitectAgent through AgentFactory
        common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase: getting ArchitectAgent from factory, runId: ${runId}`);
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.ARCHITECT);
        common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase: ArchitectAgent obtained, runId: ${runId}`);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const startTime = Date.now();
        common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase: calling agent.execute, runId: ${runId}, phase: ${state.phase}`);
        try {
            const output = await agent.execute(context, options);
            const durationMs = Date.now() - startTime;
            common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase: agent.execute completed, runId: ${runId}`);
            // Record successful agent execution metrics
            this.metricsService.recordAgentExecution({
                agentName: AgentModels_1.AgentType.ARCHITECT,
                runId,
                projectId: options.projectId,
                success: true,
                durationMs,
            });
            state.narrative = output.content;
            state.updatedAt = new Date().toISOString();
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            // Record failed agent execution metrics
            this.metricsService.recordAgentExecution({
                agentName: AgentModels_1.AgentType.ARCHITECT,
                runId,
                projectId: options.projectId,
                success: false,
                durationMs,
                errorType: error instanceof Error ? error.name : "unknown",
                errorMessage: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        // CRITICAL: Add seed constraints immediately after Genesis
        // These are immutable and prevent context drift (e.g., Mara Venn → Elena Rodriguez)
        this.addSeedConstraints(state, options.seedIdea);
        // Save to Supabase
        await this.saveArtifact(runId, options.projectId, "narrative", state.narrative);
        await this.publishPhaseComplete(runId, LLMModels_1.GenerationPhase.GENESIS, state.narrative);
    }
    /**
     * Add immutable seed constraints from Genesis phase
     * These constraints have sceneNumber=0 and are never overwritten by Archivist
     * Prevents context drift where LLM "forgets" the original story concept
     */
    addSeedConstraints(state, seedIdea) {
        const narrative = state.narrative;
        const timestamp = new Date().toISOString();
        // Add seed idea as immutable constraint
        state.keyConstraints.push({
            key: "seed_idea",
            value: seedIdea,
            sceneNumber: 0,
            timestamp,
            immutable: true,
        });
        // Extract key story elements from narrative
        // Use extractStringValue to handle both string and object formats
        if (narrative.genre) {
            state.keyConstraints.push({
                key: "genre",
                value: this.extractStringValue(narrative.genre),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        if (narrative.premise) {
            state.keyConstraints.push({
                key: "premise",
                value: this.extractStringValue(narrative.premise),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        if (narrative.tone) {
            state.keyConstraints.push({
                key: "tone",
                value: this.extractStringValue(narrative.tone),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        if (narrative.arc) {
            state.keyConstraints.push({
                key: "narrative_arc",
                value: this.extractStringValue(narrative.arc),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        common_1.$log.info(`[StorytellerOrchestrator] Added ${state.keyConstraints.length} seed constraints`);
    }
    /**
     * Extract string value from a field that might be string or object
     * Handles cases where LLM returns {name: "...", description: "..."} instead of plain string
     * Prevents [object Object] serialization issues in constraints
     */
    extractStringValue(value) {
        if (typeof value === "string") {
            return value;
        }
        if (value && typeof value === "object") {
            const obj = value;
            // Try common field names that LLMs use
            if (typeof obj.name === "string")
                return obj.name;
            if (typeof obj.theme === "string")
                return obj.theme;
            if (typeof obj.description === "string")
                return obj.description;
            if (typeof obj.type === "string")
                return obj.type;
            if (typeof obj.structure === "string")
                return obj.structure;
            // Fallback to JSON stringification for complex objects
            return JSON.stringify(value);
        }
        return "";
    }
    /**
     * Characters Phase - Character creation
     */
    async runCharactersPhase(runId, options) {
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase called, runId: ${runId}`);
        const state = this.activeRuns.get(runId);
        if (!state || !state.narrative) {
            common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: state or narrative not found, returning, runId: ${runId}`);
            return;
        }
        state.phase = LLMModels_1.GenerationPhase.CHARACTERS;
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: phase set to CHARACTERS, runId: ${runId}`);
        await this.publishPhaseStart(runId, LLMModels_1.GenerationPhase.CHARACTERS);
        // Use ProfilerAgent through AgentFactory
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: getting ProfilerAgent from factory, runId: ${runId}`);
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.PROFILER);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const startTime = Date.now();
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: calling agent.execute, runId: ${runId}`);
        try {
            const output = await agent.execute(context, options);
            const durationMs = Date.now() - startTime;
            common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: agent.execute completed, output.content type: ${typeof output.content}, isArray: ${Array.isArray(output.content)}, runId: ${runId}`);
            // Record successful agent execution metrics
            this.metricsService.recordAgentExecution({
                agentName: AgentModels_1.AgentType.PROFILER,
                runId,
                projectId: options.projectId,
                success: true,
                durationMs,
            });
            state.characters = output.content;
            state.updatedAt = new Date().toISOString();
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            // Record failed agent execution metrics
            this.metricsService.recordAgentExecution({
                agentName: AgentModels_1.AgentType.PROFILER,
                runId,
                projectId: options.projectId,
                success: false,
                durationMs,
                errorType: error instanceof Error ? error.name : "unknown",
                errorMessage: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        // Store characters in Qdrant and Supabase
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: storing ${state.characters?.length || 0} characters, runId: ${runId}`);
        try {
            if (Array.isArray(state.characters)) {
                for (const character of state.characters) {
                    // Store in Qdrant first (returns pointId)
                    common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: storing character in Qdrant, runId: ${runId}`);
                    const qdrantId = await this.qdrantMemory.storeCharacter(options.projectId, character);
                    // Store in Supabase with qdrant_id reference and runId for Langfuse tracing
                    try {
                        await this.supabase.saveCharacter(options.projectId, character, qdrantId, runId);
                    }
                    catch (supabaseError) {
                        common_1.$log.error(`[StorytellerOrchestrator] runCharactersPhase: Supabase storage failed (continuing anyway), runId: ${runId}`, supabaseError);
                    }
                }
            }
            else {
                common_1.$log.warn(`[StorytellerOrchestrator] runCharactersPhase: state.characters is not an array, skipping storage, runId: ${runId}`);
            }
        }
        catch (qdrantError) {
            common_1.$log.error(`[StorytellerOrchestrator] runCharactersPhase: Storage failed, continuing anyway, runId: ${runId}`, qdrantError);
        }
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: saving artifact, runId: ${runId}`);
        await this.saveArtifact(runId, options.projectId, "characters", state.characters);
        // Phase 5: Save characters to normalized Supabase table
        try {
            if (Array.isArray(state.characters)) {
                await this.supabase.upsertCharacters(options.projectId, runId, state.characters);
                common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: saved ${state.characters.length} characters to Supabase, runId: ${runId}`);
            }
        }
        catch (supabaseError) {
            common_1.$log.error(`[StorytellerOrchestrator] runCharactersPhase: Supabase upsertCharacters failed, continuing anyway, runId: ${runId}`, supabaseError);
        }
        // Phase 4: Initialize world state after characters are created
        try {
            if (Array.isArray(state.characters)) {
                const archivistAgent = this.agentFactory.getAgent(AgentModels_1.AgentType.ARCHIVIST);
                state.worldState = archivistAgent.buildInitialWorldState(runId, state.characters);
                common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: initialized world state with ${state.characters.length} characters, runId: ${runId}`);
            }
        }
        catch (worldStateError) {
            common_1.$log.error(`[StorytellerOrchestrator] runCharactersPhase: world state initialization failed, continuing anyway, runId: ${runId}`, worldStateError);
        }
        // LLM-as-a-Judge: Evaluate relevance of character profiles to seed idea
        // Runs asynchronously to not block generation
        // Uses rate limiting (max 3 concurrent) to avoid hitting LLM provider rate limits
        if (process.env.EVALUATION_ENABLED === "true" && this.evaluationService.isEnabled) {
            try {
                if (Array.isArray(state.characters)) {
                    for (const character of state.characters) {
                        const characterName = String(character.name || "Unknown");
                        const profilerOutput = JSON.stringify(character, null, 2);
                        // Fire and forget with rate limiting - don't await to avoid blocking generation
                        // Uses shared class-level rate limiter (max 3 concurrent) for all evaluation calls
                        this.evaluationRateLimiter(() => this.evaluationService.evaluateRelevance({
                            runId,
                            profilerOutput,
                            seedIdea: options.seedIdea,
                            characterName,
                        })).catch((err) => {
                            common_1.$log.warn(`[StorytellerOrchestrator] Relevance evaluation failed for ${characterName}: ${err.message}`);
                        });
                    }
                    common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: triggered relevance evaluations for ${state.characters.length} characters (rate limited to 3 concurrent), runId: ${runId}`);
                }
            }
            catch (evalError) {
                common_1.$log.warn(`[StorytellerOrchestrator] runCharactersPhase: evaluation setup failed, continuing anyway, runId: ${runId}`, evalError);
            }
        }
        // Index characters in WorldBibleEmbeddingService for semantic consistency checking
        // Runs asynchronously to not block generation - errors are logged but don't fail the phase
        if (this.worldBibleEmbedding.connected && Array.isArray(state.characters)) {
            try {
                const indexResult = await this.worldBibleEmbedding.indexCharacters(options.projectId, state.characters);
                common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: indexed ${indexResult.indexed} characters in WorldBibleEmbedding, errors: ${indexResult.errors.length}, runId: ${runId}`);
                if (indexResult.errors.length > 0) {
                    common_1.$log.warn(`[StorytellerOrchestrator] runCharactersPhase: WorldBibleEmbedding indexing errors: ${indexResult.errors.join(', ')}, runId: ${runId}`);
                }
            }
            catch (embeddingError) {
                common_1.$log.warn(`[StorytellerOrchestrator] runCharactersPhase: WorldBibleEmbedding indexing failed, continuing anyway, runId: ${runId}`, embeddingError);
            }
        }
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: publishing phase complete, runId: ${runId}`);
        await this.publishPhaseComplete(runId, LLMModels_1.GenerationPhase.CHARACTERS, state.characters);
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: completed, runId: ${runId}`);
    }
    /**
     * Worldbuilding Phase - Setting and world details
     */
    async runWorldbuildingPhase(runId, options) {
        const state = this.activeRuns.get(runId);
        if (!state || !state.narrative)
            return;
        state.phase = LLMModels_1.GenerationPhase.WORLDBUILDING;
        await this.publishPhaseStart(runId, LLMModels_1.GenerationPhase.WORLDBUILDING);
        // Use WorldbuilderAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.WORLDBUILDER);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const startTime = Date.now();
        try {
            const output = await agent.execute(context, options);
            const durationMs = Date.now() - startTime;
            // Record successful agent execution metrics
            this.metricsService.recordAgentExecution({
                agentName: AgentModels_1.AgentType.WORLDBUILDER,
                runId,
                projectId: options.projectId,
                success: true,
                durationMs,
            });
            state.worldbuilding = output.content;
            state.updatedAt = new Date().toISOString();
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            // Record failed agent execution metrics
            this.metricsService.recordAgentExecution({
                agentName: AgentModels_1.AgentType.WORLDBUILDER,
                runId,
                projectId: options.projectId,
                success: false,
                durationMs,
                errorType: error instanceof Error ? error.name : "unknown",
                errorMessage: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
        // Store worldbuilding elements in Qdrant and Supabase
        const worldData = state.worldbuilding;
        for (const [elementType, element] of Object.entries(worldData)) {
            if (typeof element === "object" && element !== null) {
                try {
                    // Store in Qdrant first (returns pointId)
                    const qdrantId = await this.qdrantMemory.storeWorldbuilding(options.projectId, elementType, element);
                    // Store in Supabase with qdrant_id reference and runId for Langfuse tracing
                    try {
                        await this.supabase.saveWorldbuilding(options.projectId, elementType, element, qdrantId, runId);
                    }
                    catch (supabaseError) {
                        common_1.$log.error(`[StorytellerOrchestrator] runWorldbuildingPhase: Supabase storage failed for ${elementType} (continuing anyway), runId: ${runId}`, supabaseError);
                    }
                }
                catch (qdrantError) {
                    common_1.$log.error(`[StorytellerOrchestrator] runWorldbuildingPhase: Qdrant storage failed for ${elementType} (continuing anyway), runId: ${runId}`, qdrantError);
                }
            }
        }
        await this.saveArtifact(runId, options.projectId, "worldbuilding", state.worldbuilding);
        // Index worldbuilding in WorldBibleEmbeddingService for semantic consistency checking
        // Runs after storage to ensure data is persisted first - errors are logged but don't fail the phase
        if (this.worldBibleEmbedding.connected && state.worldbuilding) {
            try {
                const indexResult = await this.worldBibleEmbedding.indexWorldbuilding(options.projectId, state.worldbuilding);
                common_1.$log.info(`[StorytellerOrchestrator] runWorldbuildingPhase: indexed ${indexResult.indexed} worldbuilding elements in WorldBibleEmbedding, errors: ${indexResult.errors.length}, runId: ${runId}`);
                if (indexResult.errors.length > 0) {
                    common_1.$log.warn(`[StorytellerOrchestrator] runWorldbuildingPhase: WorldBibleEmbedding indexing errors: ${indexResult.errors.join(', ')}, runId: ${runId}`);
                }
            }
            catch (embeddingError) {
                common_1.$log.warn(`[StorytellerOrchestrator] runWorldbuildingPhase: WorldBibleEmbedding indexing failed, continuing anyway, runId: ${runId}`, embeddingError);
            }
        }
        await this.publishPhaseComplete(runId, LLMModels_1.GenerationPhase.WORLDBUILDING, state.worldbuilding);
    }
    /**
     * Outlining Phase - Scene-by-scene outline
     */
    async runOutliningPhase(runId, options) {
        const state = this.activeRuns.get(runId);
        if (!state || !state.narrative)
            return;
        state.phase = LLMModels_1.GenerationPhase.OUTLINING;
        await this.publishPhaseStart(runId, LLMModels_1.GenerationPhase.OUTLINING);
        // Use StrategistAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.STRATEGIST);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        state.outline = output.content;
        const scenes = state.outline?.scenes;
        state.totalScenes = Array.isArray(scenes) ? scenes.length : 0;
        state.updatedAt = new Date().toISOString();
        await this.saveArtifact(runId, options.projectId, "outline", state.outline);
        await this.publishPhaseComplete(runId, LLMModels_1.GenerationPhase.OUTLINING, state.outline);
    }
    /**
     * Advanced Planning Phase - Detailed planning with motifs and subtext
     */
    async runAdvancedPlanningPhase(runId, options) {
        const state = this.activeRuns.get(runId);
        if (!state || !state.outline)
            return;
        state.phase = LLMModels_1.GenerationPhase.ADVANCED_PLANNING;
        await this.publishPhaseStart(runId, LLMModels_1.GenerationPhase.ADVANCED_PLANNING);
        // Use StrategistAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.STRATEGIST);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        const advancedPlan = output.content;
        state.updatedAt = new Date().toISOString();
        await this.saveArtifact(runId, options.projectId, "advanced_plan", advancedPlan);
        await this.publishPhaseComplete(runId, LLMModels_1.GenerationPhase.ADVANCED_PLANNING, advancedPlan);
    }
    /**
     * Drafting Loop - Draft, Critique, Revise for each scene
     *
     * Key improvements:
     * 1. Proactive Beats Method for scenes > 1000 target words (split into 3-4 parts upfront)
     * 2. Word count validation with expansion loop before Critic (for shorter scenes)
     * 3. Polish only runs if scene was approved (not after failed revisions)
     * 4. Strips fake "Word count:" claims from Writer output
     */
    async runDraftingLoop(runId, options) {
        const state = this.activeRuns.get(runId);
        if (!state || !state.outline)
            return;
        const scenes = state.outline?.scenes;
        if (!Array.isArray(scenes))
            return;
        for (let sceneNum = 0; sceneNum < scenes.length; sceneNum++) {
            if (this.shouldStop(runId))
                return;
            state.currentScene = sceneNum + 1;
            const scene = scenes[sceneNum];
            // Use safeParseWordCount to handle string values like "1,900" and prevent NaN
            const targetWordCount = (0, schemaNormalizers_1.safeParseWordCount)(scene.wordCount, 1500);
            const minWordCount = Math.floor(targetWordCount * 0.7); // 70% threshold
            // PROACTIVE BEATS METHOD: For scenes with target > 1000 words, split into parts upfront
            // This prevents the Writer↔Critic deadlock where LLMs can't produce 1500+ words in one shot
            const BEATS_THRESHOLD = 1000;
            if (targetWordCount > BEATS_THRESHOLD) {
                console.log(`[Orchestrator] Scene ${sceneNum + 1} target ${targetWordCount} words > ${BEATS_THRESHOLD}, using Proactive Beats Method`);
                await this.draftSceneWithBeats(runId, options, sceneNum + 1, scene, targetWordCount);
            }
            else {
                // Standard single-shot drafting for shorter scenes
                await this.draftScene(runId, options, sceneNum + 1, scene);
            }
            if (this.shouldStop(runId))
                return;
            // Word count expansion loop - expand if still too short before calling Critic
            // This is a fallback safety net after beats method or single-shot drafting
            let expansionAttempts = 0;
            const maxExpansions = 3;
            while (expansionAttempts < maxExpansions) {
                const draft = state.drafts.get(sceneNum + 1);
                const actualWordCount = draft?.wordCount ?? 0;
                if (actualWordCount >= minWordCount)
                    break;
                console.log(`[Orchestrator] Scene ${sceneNum + 1} too short (${actualWordCount}/${minWordCount} words), expanding...`);
                await this.expandScene(runId, options, sceneNum + 1, scene, targetWordCount - actualWordCount);
                expansionAttempts++;
                if (this.shouldStop(runId))
                    return;
            }
            // Critique and revision loop (max 2 iterations)
            let revisionCount = 0;
            let sceneApproved = false;
            let approvedCritiqueScore;
            while (revisionCount < state.maxRevisions) {
                if (this.shouldStop(runId))
                    return;
                // Critique
                const critique = await this.critiqueScene(runId, options, sceneNum + 1);
                if (this.shouldStop(runId))
                    return;
                // Check if revision needed
                if (this.isApproved(critique)) {
                    sceneApproved = true;
                    // Extract score from the approving critique
                    const score = critique.score;
                    if (typeof score === "number" && !isNaN(score)) {
                        approvedCritiqueScore = score;
                    }
                    break;
                }
                // Revise
                await this.reviseScene(runId, options, sceneNum + 1, critique);
                revisionCount++;
                state.revisionCount.set(sceneNum + 1, revisionCount);
            }
            // Run Archivist every 3 scenes
            if ((sceneNum + 1) % 3 === 0 && sceneNum + 1 > state.lastArchivistScene) {
                await this.runArchivistCheck(runId, options, sceneNum + 1);
                state.lastArchivistScene = sceneNum + 1;
            }
            // Polish the scene ONLY if it was approved AND score < 8
            // Skip Polish if Critic gave score >= 8 (scene is already high quality)
            // This saves time and money, and prevents Polish from degrading good content
            // Note: >= 8 aligns with isApproved() threshold for consistency
            const shouldSkipPolish = typeof approvedCritiqueScore === "number" && approvedCritiqueScore >= 8;
            if (sceneApproved && !shouldSkipPolish) {
                await this.polishScene(runId, options, sceneNum + 1);
            }
            else if (sceneApproved && shouldSkipPolish) {
                // CRITICAL: Emit scene_polish_complete even when skipping Polish
                // This ensures frontend always has a canonical source of truth for each scene
                // Without this, frontend falls back to collecting all Writer messages which causes duplication
                console.log(`[Orchestrator] Scene ${sceneNum + 1} has high score (${approvedCritiqueScore}), skipping polish`);
                await this.emitSceneFinal(runId, options.projectId, sceneNum + 1, "skipped_high_score");
            }
            else {
                // Scene not approved after max revisions - still emit final event for frontend
                console.log(`[Orchestrator] Scene ${sceneNum + 1} not approved after ${revisionCount} revisions, skipping polish`);
                await this.emitSceneFinal(runId, options.projectId, sceneNum + 1, "not_approved");
            }
            // CRITICAL: Clear currentSceneOutline at the end of each scene to prevent state contamination
            // Without this, Scene 2 would use Scene 1's outline data due to stale state
            state.currentSceneOutline = undefined;
        }
    }
    /**
     * Draft a single scene
     */
    async draftScene(runId, options, sceneNum, sceneOutline) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        state.phase = LLMModels_1.GenerationPhase.DRAFTING;
        state.currentScene = sceneNum;
        await this.publishEvent(runId, "scene_draft_start", { sceneNum });
        const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);
        // Retrieve relevant context from Qdrant for hallucination prevention
        // This provides the Writer with semantic memory of characters, worldbuilding, and previous scenes
        const relevantContext = await this.getRelevantContext(options.projectId, sceneOutline);
        // CRITICAL: Set currentSceneOutline at the start of each scene
        // This ensures WriterAgent always has the correct outline for this scene
        // and prevents state contamination from previous scenes
        // Include retrieved context for hallucination prevention
        state.currentSceneOutline = {
            ...sceneOutline,
            retrievedContext: relevantContext, // Add Qdrant context for Writer
        };
        // Store scene outline in state for WriterAgent to access
        const outline = state.outline;
        if (!outline) {
            throw new Error("Outline not found in state");
        }
        // Use WriterAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.WRITER);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
        const response = this.stripFakeWordCount(output.content);
        const draft = {
            sceneNum,
            title: sceneTitle,
            content: response,
            wordCount: response.split(/\s+/).length,
            createdAt: new Date().toISOString(),
        };
        state.drafts.set(sceneNum, draft);
        state.updatedAt = new Date().toISOString();
        // Check semantic consistency against World Bible entries
        // This finds related content that may need human review for consistency
        // Note: Uses semanticConsistencyEnabled to ensure embedding provider is configured
        if (this.worldBibleEmbedding.semanticConsistencyEnabled) {
            try {
                const consistencyResult = await this.worldBibleEmbedding.checkSemanticConsistency(options.projectId, response);
                if (consistencyResult.hasContradiction) {
                    draft.semanticCheckError = consistencyResult.explanation;
                    draft.contradictionScore = consistencyResult.contradictionScore;
                    common_1.$log.warn(`[StorytellerOrchestrator] draftScene: Semantic consistency warning for scene ${sceneNum}: ${draft.semanticCheckError}, runId: ${runId}`);
                }
                else {
                    common_1.$log.info(`[StorytellerOrchestrator] draftScene: Semantic consistency check passed for scene ${sceneNum}, runId: ${runId}`);
                }
            }
            catch (consistencyError) {
                common_1.$log.warn(`[StorytellerOrchestrator] draftScene: Semantic consistency check failed, continuing anyway, runId: ${runId}`, consistencyError);
            }
        }
        // Extract and log raw facts
        await this.extractRawFacts(runId, sceneNum, response, AgentModels_1.AgentType.WRITER);
        // Store scene in Qdrant and Supabase
        try {
            const qdrantId = await this.qdrantMemory.storeScene(options.projectId, sceneNum, draft);
            // Store in Supabase with qdrant_id reference and runId for Langfuse tracing
            try {
                await this.supabase.saveDraft(options.projectId, draft, qdrantId, runId);
            }
            catch (supabaseError) {
                common_1.$log.error(`[StorytellerOrchestrator] draftScene: Supabase storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`, supabaseError);
            }
        }
        catch (qdrantError) {
            common_1.$log.error(`[StorytellerOrchestrator] draftScene: Qdrant storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`, qdrantError);
        }
        await this.saveArtifact(runId, options.projectId, `draft_scene_${sceneNum}`, draft);
        // Phase 5: Save draft to normalized Supabase table
        try {
            await this.supabase.upsertDraft({
                projectId: options.projectId,
                runId,
                sceneNumber: sceneNum,
                content: response,
                wordCount: draft.wordCount,
                status: "draft",
                revisionCount: 0,
                semanticCheckError: draft.semanticCheckError,
                contradictionScore: draft.contradictionScore,
            });
            common_1.$log.info(`[StorytellerOrchestrator] draftScene: saved draft to Supabase, scene ${sceneNum}, runId: ${runId}`);
        }
        catch (supabaseError) {
            common_1.$log.error(`[StorytellerOrchestrator] draftScene: Supabase upsertDraft failed, continuing anyway, runId: ${runId}`, supabaseError);
        }
        await this.publishEvent(runId, "scene_draft_complete", {
            sceneNum,
            wordCount: draft.wordCount,
            semanticCheckError: draft.semanticCheckError,
            contradictionScore: draft.contradictionScore,
        });
        // LLM-as-a-Judge: Evaluate faithfulness of Writer output to Architect plan
        // Runs asynchronously to not block generation
        // Uses shared rate limiter (max 3 concurrent) to avoid hitting LLM provider rate limits
        if (process.env.EVALUATION_ENABLED === "true" && this.evaluationService.isEnabled) {
            try {
                const architectPlan = JSON.stringify(sceneOutline, null, 2);
                // Fire and forget with rate limiting - don't await to avoid blocking generation
                // Uses shared class-level rate limiter (max 3 concurrent) for all evaluation calls
                this.evaluationRateLimiter(() => this.evaluationService.evaluateFaithfulness({
                    runId,
                    writerOutput: response,
                    architectPlan,
                    sceneNumber: sceneNum,
                })).catch((err) => {
                    common_1.$log.warn(`[StorytellerOrchestrator] Faithfulness evaluation failed for scene ${sceneNum}: ${err.message}`);
                });
                common_1.$log.info(`[StorytellerOrchestrator] draftScene: triggered faithfulness evaluation for scene ${sceneNum} (rate limited), runId: ${runId}`);
            }
            catch (evalError) {
                common_1.$log.warn(`[StorytellerOrchestrator] draftScene: evaluation setup failed, continuing anyway, runId: ${runId}`, evalError);
            }
        }
    }
    /**
     * Draft a scene using the Proactive Beats Method
     * Splits the scene into 3-4 parts and generates each sequentially
     * This prevents the Writer↔Critic deadlock where LLMs can't produce 1500+ words in one shot
     *
     * @param targetWordCount - Total target word count for the scene
     */
    async draftSceneWithBeats(runId, options, sceneNum, sceneOutline, targetWordCount) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        state.phase = LLMModels_1.GenerationPhase.DRAFTING;
        state.currentScene = sceneNum;
        await this.publishEvent(runId, "scene_draft_start", { sceneNum, method: "beats" });
        const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);
        // Calculate number of parts (3-4 based on target word count)
        // ~500 words per part is optimal for LLM generation
        const WORDS_PER_PART = 500;
        const partsTotal = Math.min(4, Math.max(3, Math.ceil(targetWordCount / WORDS_PER_PART)));
        const partTargetWords = Math.ceil(targetWordCount / partsTotal);
        console.log(`[Orchestrator] Scene ${sceneNum} Beats Method: ${partsTotal} parts, ~${partTargetWords} words each`);
        // Retrieve relevant context from Qdrant for hallucination prevention
        const relevantContext = await this.getRelevantContext(options.projectId, sceneOutline);
        let combinedContent = "";
        const maxRetriesPerPart = 3;
        for (let partIndex = 1; partIndex <= partsTotal; partIndex++) {
            if (this.shouldStop(runId))
                return;
            await this.publishEvent(runId, "scene_beat_start", {
                sceneNum,
                partIndex,
                partsTotal,
                partTargetWords
            });
            let partContent = "";
            let retryCount = 0;
            const minPartWords = Math.floor(partTargetWords * 0.5); // 50% threshold per part
            // Retry loop for this part
            while (retryCount < maxRetriesPerPart) {
                // Set currentSceneOutline with beat-specific instructions
                state.currentSceneOutline = {
                    ...sceneOutline,
                    retrievedContext: relevantContext,
                    beatsMode: true,
                    partIndex,
                    partsTotal,
                    partTargetWords,
                    existingContent: combinedContent || undefined,
                    isFirstPart: partIndex === 1,
                    isFinalPart: partIndex === partsTotal,
                };
                // Use WriterAgent through AgentFactory
                const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.WRITER);
                const context = {
                    runId,
                    state,
                    projectId: options.projectId,
                };
                const output = await agent.execute(context, options);
                partContent = this.stripFakeWordCount(output.content);
                // For parts 2+, strip overlap with existing content
                if (partIndex > 1 && combinedContent) {
                    const rawPartContent = partContent;
                    const strippedContent = this.stripOverlap(combinedContent, partContent);
                    // Handle case where stripOverlap returns empty (LLM repeated all content)
                    if (!strippedContent || strippedContent.trim().length === 0) {
                        console.warn(`[Orchestrator] Scene ${sceneNum} Part ${partIndex}: stripOverlap returned empty, using raw content`);
                        partContent = rawPartContent; // Keep raw content instead of empty string
                    }
                    else {
                        partContent = strippedContent;
                    }
                }
                const partWordCount = partContent.split(/\s+/).length;
                if (partWordCount >= minPartWords) {
                    console.log(`[Orchestrator] Scene ${sceneNum} Part ${partIndex}/${partsTotal}: ${partWordCount} words (target: ${partTargetWords})`);
                    break;
                }
                retryCount++;
                console.log(`[Orchestrator] Scene ${sceneNum} Part ${partIndex} too short (${partWordCount}/${minPartWords}), retry ${retryCount}/${maxRetriesPerPart}`);
            }
            // FAIL-FAST: Check if we exhausted retries without meeting minimum word count
            const finalPartWordCount = partContent.split(/\s+/).length;
            if (retryCount >= maxRetriesPerPart && finalPartWordCount < minPartWords) {
                await this.publishEvent(runId, "scene_beat_error", {
                    sceneNum,
                    partIndex,
                    partsTotal,
                    reason: `Failed to generate sufficient content after ${maxRetriesPerPart} attempts`,
                    wordsGenerated: finalPartWordCount,
                    wordsRequired: minPartWords
                });
                console.error(`[Orchestrator] Scene ${sceneNum} Part ${partIndex} failed after ${maxRetriesPerPart} retries (${finalPartWordCount}/${minPartWords} words)`);
                throw new Error(`Scene ${sceneNum} beat ${partIndex} generation failed: insufficient content after ${maxRetriesPerPart} retries (got ${finalPartWordCount} words, needed ${minPartWords})`);
            }
            // Append part to combined content
            if (partIndex === 1) {
                combinedContent = partContent;
            }
            else {
                combinedContent = combinedContent + "\n\n" + partContent;
            }
            await this.publishEvent(runId, "scene_beat_complete", {
                sceneNum,
                partIndex,
                partsTotal,
                partWordCount: partContent.split(/\s+/).length,
                totalWordCount: combinedContent.split(/\s+/).length
            });
        }
        // Create the final draft from combined content
        const draft = {
            sceneNum,
            title: sceneTitle,
            content: combinedContent,
            wordCount: combinedContent.split(/\s+/).length,
            createdAt: new Date().toISOString(),
            beatsMethod: true,
            partsGenerated: partsTotal,
        };
        state.drafts.set(sceneNum, draft);
        state.updatedAt = new Date().toISOString();
        // Check semantic consistency against World Bible entries (same as draftScene)
        // This finds related content that may need human review for consistency
        // Note: Uses semanticConsistencyEnabled to ensure embedding provider is configured
        if (this.worldBibleEmbedding.semanticConsistencyEnabled) {
            try {
                const consistencyResult = await this.worldBibleEmbedding.checkSemanticConsistency(options.projectId, combinedContent);
                if (consistencyResult.hasContradiction) {
                    draft.semanticCheckError = consistencyResult.explanation;
                    draft.contradictionScore = consistencyResult.contradictionScore;
                    common_1.$log.warn(`[StorytellerOrchestrator] draftSceneWithBeats: Semantic consistency warning for scene ${sceneNum}: ${draft.semanticCheckError}, runId: ${runId}`);
                }
                else {
                    common_1.$log.info(`[StorytellerOrchestrator] draftSceneWithBeats: Semantic consistency check passed for scene ${sceneNum}, runId: ${runId}`);
                }
            }
            catch (consistencyError) {
                common_1.$log.warn(`[StorytellerOrchestrator] draftSceneWithBeats: Semantic consistency check failed, continuing anyway, runId: ${runId}`, consistencyError);
            }
        }
        // Extract and log raw facts
        await this.extractRawFacts(runId, sceneNum, combinedContent, AgentModels_1.AgentType.WRITER);
        // Store scene in Qdrant and Supabase (same as draftScene)
        try {
            const qdrantId = await this.qdrantMemory.storeScene(options.projectId, sceneNum, draft);
            try {
                await this.supabase.saveDraft(options.projectId, draft, qdrantId, runId);
            }
            catch (supabaseError) {
                common_1.$log.error(`[StorytellerOrchestrator] draftSceneWithBeats: Supabase storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`, supabaseError);
            }
        }
        catch (qdrantError) {
            common_1.$log.error(`[StorytellerOrchestrator] draftSceneWithBeats: Qdrant storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`, qdrantError);
        }
        await this.saveArtifact(runId, options.projectId, `draft_scene_${sceneNum}`, draft);
        // Save draft to normalized Supabase table
        try {
            await this.supabase.upsertDraft({
                projectId: options.projectId,
                runId,
                sceneNumber: sceneNum,
                content: combinedContent,
                wordCount: draft.wordCount,
                status: "draft",
                revisionCount: 0,
                semanticCheckError: draft.semanticCheckError,
                contradictionScore: draft.contradictionScore,
            });
            common_1.$log.info(`[StorytellerOrchestrator] draftSceneWithBeats: saved draft to Supabase, scene ${sceneNum}, runId: ${runId}`);
        }
        catch (supabaseError) {
            common_1.$log.error(`[StorytellerOrchestrator] draftSceneWithBeats: Supabase upsertDraft failed, continuing anyway, runId: ${runId}`, supabaseError);
        }
        // Restore the original scene outline (without beats mode)
        state.currentSceneOutline = {
            ...sceneOutline,
            retrievedContext: relevantContext,
        };
        await this.publishEvent(runId, "scene_draft_complete", {
            sceneNum,
            wordCount: draft.wordCount,
            method: "beats",
            partsGenerated: partsTotal,
            semanticCheckError: draft.semanticCheckError,
            contradictionScore: draft.contradictionScore,
        });
        // LLM-as-a-Judge evaluation (same as draftScene)
        if (process.env.EVALUATION_ENABLED === "true" && this.evaluationService.isEnabled) {
            try {
                const architectPlan = JSON.stringify(sceneOutline, null, 2);
                this.evaluationRateLimiter(() => this.evaluationService.evaluateFaithfulness({
                    runId,
                    writerOutput: combinedContent,
                    architectPlan,
                    sceneNumber: sceneNum,
                })).catch((err) => {
                    common_1.$log.warn(`[StorytellerOrchestrator] Faithfulness evaluation failed for scene ${sceneNum}: ${err.message}`);
                });
                common_1.$log.info(`[StorytellerOrchestrator] draftSceneWithBeats: triggered faithfulness evaluation for scene ${sceneNum} (rate limited), runId: ${runId}`);
            }
            catch (evalError) {
                common_1.$log.warn(`[StorytellerOrchestrator] draftSceneWithBeats: evaluation setup failed, continuing anyway, runId: ${runId}`, evalError);
            }
        }
    }
    /**
     * Critique a scene
     */
    async critiqueScene(runId, options, sceneNum) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return { approved: true };
        const draft = state.drafts.get(sceneNum);
        if (!draft)
            return { approved: true };
        state.phase = LLMModels_1.GenerationPhase.CRITIQUE;
        state.currentScene = sceneNum;
        await this.publishEvent(runId, "scene_critique_start", { sceneNum });
        // Use CriticAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.CRITIC);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        const critique = output.content;
        if (!state.critiques.has(sceneNum)) {
            state.critiques.set(sceneNum, []);
        }
        state.critiques.get(sceneNum).push(critique);
        state.updatedAt = new Date().toISOString();
        await this.saveArtifact(runId, options.projectId, `critique_scene_${sceneNum}`, critique);
        // Phase 5: Save critique to normalized Supabase table
        try {
            const revisionCount = state.revisionCount.get(sceneNum) || 0;
            await this.supabase.saveCritique({
                projectId: options.projectId,
                runId,
                sceneNumber: sceneNum,
                critique,
                revisionNumber: revisionCount,
            });
            common_1.$log.info(`[StorytellerOrchestrator] critiqueScene: saved critique to Supabase, scene ${sceneNum}, runId: ${runId}`);
        }
        catch (supabaseError) {
            common_1.$log.error(`[StorytellerOrchestrator] critiqueScene: Supabase saveCritique failed, continuing anyway, runId: ${runId}`, supabaseError);
        }
        await this.publishEvent(runId, "scene_critique_complete", { sceneNum, critique });
        return critique;
    }
    /**
     * Revise a scene based on critique
     */
    async reviseScene(runId, options, sceneNum, critique) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        const draft = state.drafts.get(sceneNum);
        if (!draft)
            return;
        state.phase = LLMModels_1.GenerationPhase.REVISION;
        state.currentScene = sceneNum;
        await this.publishEvent(runId, "scene_revision_start", { sceneNum });
        // Use WriterAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.WRITER);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
        const response = this.stripFakeWordCount(output.content);
        const revision = {
            sceneNum,
            title: draft.title,
            content: response,
            wordCount: response.split(/\s+/).length,
            revisionNumber: (state.revisionCount.get(sceneNum) ?? 0) + 1,
            createdAt: new Date().toISOString(),
        };
        state.drafts.set(sceneNum, revision);
        state.updatedAt = new Date().toISOString();
        // Extract new facts from revision
        await this.extractRawFacts(runId, sceneNum, response, AgentModels_1.AgentType.WRITER);
        await this.saveArtifact(runId, options.projectId, `revision_scene_${sceneNum}`, revision);
        await this.publishEvent(runId, "scene_revision_complete", { sceneNum });
    }
    /**
     * Expand a scene by continuing from where it left off
     * Used when scene is too short before calling Critic
     * This prevents the Critic↔Writer deadlock
     *
     * @param sceneOutline - The original scene outline (passed explicitly to prevent state contamination)
     */
    async expandScene(runId, options, sceneNum, sceneOutline, additionalWordsNeeded) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        const draft = state.drafts.get(sceneNum);
        if (!draft)
            return;
        state.phase = LLMModels_1.GenerationPhase.DRAFTING;
        state.currentScene = sceneNum;
        await this.publishEvent(runId, "scene_expand_start", { sceneNum, additionalWordsNeeded });
        // CRITICAL: Use the passed sceneOutline instead of spreading stale state
        // This prevents state contamination where Scene 2 would use Scene 1's outline
        state.currentSceneOutline = {
            ...sceneOutline, // Use the correct scene outline
            expansionMode: true,
            existingContent: draft.content,
            additionalWordsNeeded,
        };
        // Use WriterAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.WRITER);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        let continuation = output.content;
        // Strip fake word count claims from output
        continuation = this.stripFakeWordCount(continuation);
        // Append continuation to existing content
        const existingContent = String(draft.content ?? "");
        // CRITICAL: Detect and strip overlap if Writer returned full text instead of just continuation
        // This prevents text duplication when LLM ignores the "return only continuation" instruction
        continuation = this.stripOverlap(existingContent, continuation);
        // Handle case where stripOverlap returns empty string (all content was overlap)
        // In this case, keep the existing content unchanged
        if (!continuation || continuation.trim().length === 0) {
            common_1.$log.warn(`[StorytellerOrchestrator] stripOverlap returned empty continuation, keeping existing content`);
            continuation = "";
        }
        const combinedContent = existingContent + (continuation ? "\n\n" + continuation : "");
        const expanded = {
            sceneNum,
            title: draft.title,
            content: combinedContent,
            wordCount: combinedContent.split(/\s+/).length,
            expansionCount: (Number(draft.expansionCount) || 0) + 1,
            createdAt: new Date().toISOString(),
        };
        state.drafts.set(sceneNum, expanded);
        state.updatedAt = new Date().toISOString();
        // Restore the original scene outline (without expansion mode)
        // This keeps the correct outline for this scene in case of further operations
        state.currentSceneOutline = sceneOutline;
        await this.saveArtifact(runId, options.projectId, `expanded_scene_${sceneNum}`, expanded);
        // Include full assembled content in event so frontend has canonical source of truth
        await this.publishEvent(runId, "scene_expand_complete", {
            sceneNum,
            wordCount: expanded.wordCount,
            assembledContent: combinedContent
        });
    }
    /**
     * Strip fake "Word count: X" claims from Writer output
     * LLMs hallucinate word counts - we compute them programmatically instead
     */
    stripFakeWordCount(content) {
        // Remove patterns like "Word count: 1,234" or "[Word count: 2000 words]" or "**Word count:** 1500"
        return content
            .replace(/\[?\*?\*?Word count:?\*?\*?\s*[\d,]+\s*(?:words?)?\]?\.?/gi, "")
            .replace(/\n\s*\n\s*\n/g, "\n\n") // Clean up extra newlines
            .trim();
    }
    /**
     * Strip overlap from continuation if Writer returned full text instead of just continuation
     * This prevents text duplication when LLM ignores the "return only continuation" instruction
     *
     * Algorithm: Find the longest suffix of existingContent that matches a prefix of continuation,
     * then strip that overlap from continuation.
     */
    stripOverlap(existingContent, continuation) {
        if (!existingContent || !continuation) {
            return continuation;
        }
        // Normalize whitespace for comparison
        const existingNormalized = existingContent.trim();
        const continuationNormalized = continuation.trim();
        // Check if continuation starts with a significant portion of existing content
        // This indicates the LLM returned the full text instead of just continuation
        const existingWords = existingNormalized.split(/\s+/);
        const continuationWords = continuationNormalized.split(/\s+/);
        // If continuation is too short to contain meaningful overlap, skip detection
        // Use absolute minimum rather than percentage of existing content
        const MIN_WORDS_FOR_OVERLAP_DETECTION = 100;
        if (continuationWords.length < MIN_WORDS_FOR_OVERLAP_DETECTION) {
            return continuation;
        }
        // Check for large overlap (more than 30% of existing content appears at start of continuation)
        // Use a sliding window approach to find where the overlap ends
        const minOverlapWords = Math.floor(existingWords.length * 0.3);
        // Try to find where existing content ends in continuation
        // Look for the last 50 words of existing content in continuation
        const lastNWords = Math.min(50, existingWords.length);
        const existingEnding = existingWords.slice(-lastNWords).join(" ").toLowerCase();
        // Search for this ending in the continuation
        const continuationLower = continuationNormalized.toLowerCase();
        const endingIndex = continuationLower.indexOf(existingEnding);
        if (endingIndex !== -1) {
            // Found the ending of existing content in continuation
            // Strip everything up to and including this ending
            const overlapEndPosition = endingIndex + existingEnding.length;
            const strippedContinuation = continuationNormalized.substring(overlapEndPosition).trim();
            // Only use stripped version if it's substantial (more than 100 chars)
            if (strippedContinuation.length > 100) {
                common_1.$log.info(`[StorytellerOrchestrator] Stripped ${overlapEndPosition} chars of overlap from continuation`);
                return strippedContinuation;
            }
        }
        // Alternative: Check if continuation starts with a large chunk of existing content
        // by comparing first N words
        const checkWords = Math.min(100, Math.floor(existingWords.length * 0.5));
        if (checkWords > 20) {
            const existingStart = existingWords.slice(0, checkWords).join(" ").toLowerCase();
            const continuationStart = continuationWords.slice(0, checkWords).join(" ").toLowerCase();
            // If more than 80% of words match, this is likely a full rewrite
            // Split once before the filter to avoid repeated splitting inside the callback
            const contWords = continuationStart.split(" ");
            const matchingWords = existingStart.split(" ").filter((word, i) => {
                return i < contWords.length && contWords[i] === word;
            }).length;
            if (matchingWords / checkWords > 0.8) {
                // Find where existing content ends in continuation and strip
                // Use the last 30 words as anchor
                const anchorWords = existingWords.slice(-30).join(" ").toLowerCase();
                const anchorIndex = continuationLower.indexOf(anchorWords);
                if (anchorIndex !== -1) {
                    const strippedContinuation = continuationNormalized.substring(anchorIndex + anchorWords.length).trim();
                    if (strippedContinuation.length > 100) {
                        common_1.$log.info(`[StorytellerOrchestrator] Stripped overlap using anchor method`);
                        return strippedContinuation;
                    }
                }
            }
        }
        // No significant overlap detected, return original
        return continuation;
    }
    /**
     * Polish a scene (final refinement)
     *
     * CRITICAL: Includes post-polish validation to prevent chunk loss
     * If polished version is significantly shorter or missing ending, falls back to pre-polish draft
     */
    async polishScene(runId, options, sceneNum) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        const draft = state.drafts.get(sceneNum);
        if (!draft)
            return;
        state.phase = LLMModels_1.GenerationPhase.POLISH;
        state.currentScene = sceneNum;
        await this.publishEvent(runId, "scene_polish_start", { sceneNum });
        // Store pre-polish content for validation/fallback
        const prePolishContent = String(draft.content ?? "");
        const prePolishWordCount = prePolishContent.split(/\s+/).length;
        // Use WriterAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.WRITER);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
        const response = this.stripFakeWordCount(output.content);
        const polishedWordCount = response.split(/\s+/).length;
        // POST-POLISH VALIDATION: Check if polish is acceptable
        // Reject polish if it's significantly shorter (lost chunks) or missing ending
        const isPolishAcceptable = this.validatePolishOutput(prePolishContent, response, prePolishWordCount, polishedWordCount);
        let finalContent;
        let finalWordCount;
        let polishStatus;
        if (isPolishAcceptable) {
            finalContent = response;
            finalWordCount = polishedWordCount;
            polishStatus = "polished";
        }
        else {
            // FALLBACK: Keep pre-polish draft if polish failed validation
            console.log(`[Orchestrator] Scene ${sceneNum} polish rejected (${polishedWordCount}/${prePolishWordCount} words), keeping pre-polish draft`);
            finalContent = prePolishContent;
            finalWordCount = prePolishWordCount;
            polishStatus = "polish_rejected";
        }
        const polished = {
            sceneNum,
            title: draft.title,
            content: finalContent,
            wordCount: finalWordCount,
            status: polishStatus,
            createdAt: new Date().toISOString(),
        };
        state.drafts.set(sceneNum, polished);
        state.updatedAt = new Date().toISOString();
        await this.saveArtifact(runId, options.projectId, `final_scene_${sceneNum}`, polished);
        // Include final content in event so frontend has canonical source of truth
        await this.publishEvent(runId, "scene_polish_complete", {
            sceneNum,
            polishStatus,
            finalContent,
            wordCount: finalWordCount
        });
    }
    /**
     * Emit scene_polish_complete event when Polish is skipped
     * This ensures frontend always has a canonical source of truth for each scene
     * Without this, frontend falls back to collecting all Writer messages which causes duplication
     */
    async emitSceneFinal(runId, projectId, sceneNum, polishStatus) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        const draft = state.drafts.get(sceneNum);
        const finalContent = typeof draft?.content === "string" ? draft.content : "";
        const finalWordCount = typeof draft?.wordCount === "number" ? draft.wordCount : 0;
        // Update draft status
        const updatedDraft = {
            sceneNum,
            title: draft?.title ?? `Scene ${sceneNum}`,
            content: finalContent,
            wordCount: finalWordCount,
            status: polishStatus,
            createdAt: new Date().toISOString(),
        };
        state.drafts.set(sceneNum, updatedDraft);
        state.updatedAt = new Date().toISOString();
        // Save artifact for consistency with polishScene
        await this.saveArtifact(runId, projectId, `final_scene_${sceneNum}`, updatedDraft);
        // Emit the same event type as polishScene so frontend uses PRIORITY 1
        await this.publishEvent(runId, "scene_polish_complete", {
            sceneNum,
            polishStatus,
            finalContent,
            wordCount: finalWordCount,
        });
    }
    /**
     * Validate polish output to prevent chunk loss and lazy polish notes
     * Returns true if polish is acceptable, false if we should fall back to pre-polish draft
     */
    validatePolishOutput(prePolishContent, polishedContent, prePolishWordCount, polishedWordCount) {
        // CRITICAL: Detect "lazy polish" notes where LLM truncates output with meta-commentary
        // These patterns indicate the model didn't actually polish the full text
        const lazyPolishPatterns = [
            /\(note:\s*(?:the\s+)?(?:full\s+)?(?:polished\s+)?(?:scene\s+)?continues/i,
            /\(note:\s*(?:the\s+)?rest\s+(?:is\s+)?(?:the\s+)?same/i,
            /continues\s+with\s+(?:the\s+)?(?:exact\s+)?same\s+content/i,
            /rest\s+(?:of\s+the\s+scene\s+)?(?:is\s+)?(?:the\s+)?same/i,
            /\[\.\.\.(?:rest|remainder|continues)/i,
            /i\s+won'?t\s+repeat/i,
            /maintaining\s+the\s+[\d,]+[\s-]*word\s+count/i,
            /as\s+(?:the\s+)?original\s+draft/i,
        ];
        // Check the last 500 characters for lazy polish patterns (they usually appear at the end)
        const endingToCheck = polishedContent.slice(-500);
        for (const pattern of lazyPolishPatterns) {
            if (pattern.test(endingToCheck)) {
                console.log(`[Orchestrator] Polish validation failed: detected lazy polish note (pattern: ${pattern.source})`);
                return false;
            }
        }
        // Reject if polished version is more than 15% shorter (lost significant content)
        const minAcceptableWordCount = Math.floor(prePolishWordCount * 0.85);
        if (polishedWordCount < minAcceptableWordCount) {
            console.log(`[Orchestrator] Polish validation failed: word count too low (${polishedWordCount} < ${minAcceptableWordCount})`);
            return false;
        }
        // Check if ending is preserved (last 50 words should have significant overlap)
        const prePolishEnding = prePolishContent.split(/\s+/).slice(-50).join(" ").toLowerCase();
        const polishedEnding = polishedContent.split(/\s+/).slice(-50).join(" ").toLowerCase();
        // Simple overlap check: at least 30% of ending words should be present
        const prePolishEndingWords = new Set(prePolishEnding.split(/\s+/));
        const polishedEndingWords = polishedEnding.split(/\s+/);
        const matchingWords = polishedEndingWords.filter(word => prePolishEndingWords.has(word)).length;
        const overlapRatio = matchingWords / Math.max(prePolishEndingWords.size, 1);
        if (overlapRatio < 0.3) {
            console.log(`[Orchestrator] Polish validation failed: ending not preserved (overlap: ${(overlapRatio * 100).toFixed(1)}%)`);
            return false;
        }
        return true;
    }
    /**
     * Run Archivist to consolidate constraints
     */
    async runArchivistCheck(runId, options, upToScene) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        await this.publishEvent(runId, "archivist_start", { upToScene });
        // Get raw facts since last archivist run
        const newFacts = state.rawFactsLog.filter((f) => f.sceneNumber > state.lastArchivistScene && f.sceneNumber <= upToScene);
        if (newFacts.length === 0)
            return;
        state.currentScene = upToScene;
        // Use ArchivistAgent through AgentFactory
        const agent = this.agentFactory.getAgent(AgentModels_1.AgentType.ARCHIVIST);
        const context = {
            runId,
            state,
            projectId: options.projectId,
        };
        const output = await agent.execute(context, options);
        const result = output.content;
        if (result.constraints && Array.isArray(result.constraints)) {
            // Update constraints from Archivist output
            const newConstraints = result.constraints;
            // Merge with existing, resolving conflicts by timestamp
            // IMPORTANT: Never overwrite immutable constraints (seed constraints from Genesis)
            for (const newConstraint of newConstraints) {
                const existingIndex = state.keyConstraints.findIndex(c => c.key === newConstraint.key);
                if (existingIndex >= 0) {
                    const existing = state.keyConstraints[existingIndex];
                    // CRITICAL: Never overwrite immutable constraints
                    // These are seed constraints (genre, premise, tone, etc.) that prevent context drift
                    if (existing.immutable === true) {
                        console.log(`[Archivist] Skipping immutable constraint: ${existing.key}`);
                        continue;
                    }
                    // Replace if new constraint is more recent
                    if (new Date(newConstraint.timestamp) > new Date(existing.timestamp)) {
                        state.keyConstraints[existingIndex] = newConstraint;
                    }
                }
                else {
                    state.keyConstraints.push(newConstraint);
                }
            }
        }
        // Phase 4: Apply world state diff from Archivist output
        if (result.worldStateDiff && state.worldState) {
            try {
                const archivistAgent = agent;
                state.worldState = archivistAgent.applyWorldStateDiff(state.worldState, result.worldStateDiff, upToScene);
                common_1.$log.info(`[StorytellerOrchestrator] runArchivistCheck: applied world state diff for scene ${upToScene}, runId: ${runId}`);
            }
            catch (worldStateError) {
                common_1.$log.error(`[StorytellerOrchestrator] runArchivistCheck: world state diff application failed, continuing anyway, runId: ${runId}`, worldStateError);
            }
        }
        state.lastArchivistScene = upToScene;
        state.updatedAt = new Date().toISOString();
        await this.publishEvent(runId, "archivist_complete", {
            upToScene,
            constraintCount: state.keyConstraints.length,
        });
    }
    /**
     * Extract raw facts from generated content and emit to frontend
     * Uses canonical character names from state.characters as allowlist
     */
    async extractRawFacts(runId, sceneNum, content, source) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        console.log(`[extractRawFacts] Called for scene ${sceneNum}, content length: ${content.length}`);
        // Build allowlist of canonical character names from state.characters
        const canonicalNames = new Set();
        if (state.characters && Array.isArray(state.characters)) {
            for (const char of state.characters) {
                const charObj = char;
                const name = charObj.name;
                if (name) {
                    // Add full name and first name
                    canonicalNames.add(name.toLowerCase());
                    const firstName = name.split(' ')[0];
                    if (firstName)
                        canonicalNames.add(firstName.toLowerCase());
                    // Add last name if present
                    const parts = name.split(' ');
                    if (parts.length > 1) {
                        canonicalNames.add(parts[parts.length - 1].toLowerCase());
                    }
                }
            }
        }
        console.log(`[extractRawFacts] Canonical names: ${Array.from(canonicalNames).join(', ')}`);
        // Patterns that capture meaningful character actions
        const factPatterns = [
            // Character speech (most reliable - "Elena said", "Marcus whispered")
            /([A-Z][a-z]+) (said|asked|replied|answered|whispered|shouted|muttered|spoke|exclaimed|demanded|insisted)/g,
            // Character movement (location changes)
            /([A-Z][a-z]+) (walked|ran|moved|entered|left|arrived|departed|stepped|approached|retreated)/g,
            // Character discoveries/realizations
            /([A-Z][a-z]+) (discovered|found|learned|realized|understood|noticed|recognized|remembered)/g,
            // Character emotions/reactions
            /([A-Z][a-z]+) (smiled|frowned|laughed|cried|sighed|nodded|shook|gasped|trembled|froze)/g,
            // Character state changes (significant events)
            /([A-Z][a-z]+) (died|killed|married|betrayed|escaped|collapsed|awakened|transformed|vanished)/g,
        ];
        const newFacts = [];
        const seenFacts = new Set(); // Deduplicate facts
        for (const pattern of factPatterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                const subject = match[1] || "";
                const action = match[2] || "";
                // Only accept subjects that are canonical character names
                if (!canonicalNames.has(subject.toLowerCase())) {
                    continue;
                }
                // Deduplicate by subject+action
                const factKey = `${subject.toLowerCase()}-${action.toLowerCase()}`;
                if (seenFacts.has(factKey))
                    continue;
                seenFacts.add(factKey);
                // Determine category based on action type
                let category = 'plot';
                const charActions = ['smiled', 'frowned', 'laughed', 'cried', 'sighed', 'nodded', 'shook', 'gasped', 'trembled', 'froze'];
                const worldActions = ['walked', 'ran', 'moved', 'entered', 'left', 'arrived', 'departed', 'stepped', 'approached', 'retreated'];
                const plotActions = ['died', 'killed', 'married', 'betrayed', 'escaped', 'collapsed', 'awakened', 'transformed', 'vanished', 'discovered', 'found', 'learned', 'realized'];
                if (charActions.includes(action.toLowerCase())) {
                    category = 'char';
                }
                else if (worldActions.includes(action.toLowerCase())) {
                    category = 'world';
                }
                else if (plotActions.includes(action.toLowerCase())) {
                    category = 'plot';
                }
                state.rawFactsLog.push({
                    fact: `${subject} ${action}`,
                    source,
                    sceneNumber: sceneNum,
                    timestamp: new Date().toISOString(),
                });
                newFacts.push({
                    subject,
                    change: action,
                    category,
                });
            }
        }
        console.log(`[extractRawFacts] Extracted ${newFacts.length} facts from scene ${sceneNum}`);
        // Only emit if we have meaningful facts
        if (newFacts.length > 0) {
            await this.publishEvent(runId, "new_developments_collected", {
                sceneNum,
                developments: newFacts,
                totalFacts: state.rawFactsLog.length,
            });
        }
    }
    /**
     * Build constraints block for prompts
     */
    buildConstraintsBlock(constraints) {
        if (constraints.length === 0) {
            return "No constraints established yet.";
        }
        return constraints
            .map((c) => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`)
            .join("\n");
    }
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
    async getRelevantContext(projectId, sceneOutline) {
        const contextParts = [];
        // Build search query from scene outline
        const sceneTitle = String(sceneOutline.title ?? "");
        const sceneSetting = String(sceneOutline.setting ?? "");
        const sceneCharacters = Array.isArray(sceneOutline.characters)
            ? sceneOutline.characters.join(", ")
            : String(sceneOutline.characters ?? "");
        const searchQuery = `${sceneTitle} ${sceneSetting} ${sceneCharacters}`.trim();
        if (!searchQuery) {
            return "";
        }
        try {
            // Search for relevant characters
            const relevantCharacters = await this.qdrantMemory.searchCharacters(projectId, searchQuery, 3);
            if (relevantCharacters.length > 0) {
                const charContext = relevantCharacters
                    .filter(r => r.score > 0.5) // Only include high-relevance matches
                    .map(r => {
                    const char = r.payload.character;
                    return `- ${r.payload.name}: ${char.role ?? ""} ${char.coreMotivation ?? ""}`.trim();
                })
                    .join("\n");
                if (charContext) {
                    contextParts.push(`RELEVANT CHARACTERS:\n${charContext}`);
                }
            }
            // Search for relevant worldbuilding elements
            const relevantWorld = await this.qdrantMemory.searchWorldbuilding(projectId, searchQuery, 3);
            if (relevantWorld.length > 0) {
                const worldContext = relevantWorld
                    .filter(r => r.score > 0.5)
                    .map(r => {
                    const elem = r.payload.element;
                    return `- ${r.payload.elementType}: ${elem.name ?? ""} - ${elem.description ?? ""}`.trim();
                })
                    .join("\n");
                if (worldContext) {
                    contextParts.push(`RELEVANT WORLDBUILDING:\n${worldContext}`);
                }
            }
            // Search for relevant previous scenes (for continuity)
            const relevantScenes = await this.qdrantMemory.searchScenes(projectId, searchQuery, 2);
            if (relevantScenes.length > 0) {
                const sceneContext = relevantScenes
                    .filter(r => r.score > 0.5)
                    .map(r => {
                    const scene = r.payload.scene;
                    const content = String(scene.content ?? "");
                    // Include only a summary (first 200 chars) to avoid context bloat
                    const summary = content.length > 200 ? content.substring(0, 200) + "..." : content;
                    return `- Scene ${r.payload.sceneNumber} "${scene.title ?? ""}": ${summary}`;
                })
                    .join("\n");
                if (sceneContext) {
                    contextParts.push(`PREVIOUS SCENES (for continuity):\n${sceneContext}`);
                }
            }
        }
        catch (error) {
            // Log error but don't fail the generation
            console.warn(`[Orchestrator] Failed to retrieve Qdrant context: ${error}`);
        }
        if (contextParts.length === 0) {
            return "";
        }
        return `\n\nRELEVANT CONTEXT FROM MEMORY (use for consistency):\n${contextParts.join("\n\n")}`;
    }
    /**
     * Call an agent with LLM
     */
    async callAgent(runId, agent, systemPrompt, userPrompt, llmConfig, phase) {
        const messages = [
            { role: LLMModels_1.MessageRole.SYSTEM, content: systemPrompt },
            { role: LLMModels_1.MessageRole.USER, content: userPrompt },
        ];
        const spanId = this.langfuse.startSpan(runId, `${agent}_call`, { phase });
        try {
            const response = await this.llmProvider.createCompletionWithRetry({
                messages,
                model: llmConfig.model,
                provider: llmConfig.provider,
                apiKey: llmConfig.apiKey,
                temperature: llmConfig.temperature ?? 0.7,
                maxTokens: (0, LLMModels_1.getMaxTokensForPhase)(phase),
                responseFormat: userPrompt.includes("Output as JSON") || userPrompt.includes("Output JSON")
                    ? { type: "json_object" }
                    : undefined,
            });
            // Track in Langfuse
            this.langfuse.trackLLMCall(runId, agent, messages, response, spanId);
            this.langfuse.endSpan(runId, spanId, { content: response.content.substring(0, 500) });
            // Record agent message
            const state = this.activeRuns.get(runId);
            if (state) {
                state.messages.push({
                    sender: agent,
                    type: AgentModels_1.MessageType.ARTIFACT,
                    content: response.content,
                    timestamp: new Date().toISOString(),
                });
            }
            return response.content;
        }
        catch (error) {
            this.langfuse.endSpan(runId, spanId, { error: String(error) });
            throw error;
        }
    }
    /**
     * Get agent prompt from Langfuse or fallback
     */
    async getAgentPrompt(agent, variables) {
        const promptName = LangfuseService_1.AGENT_PROMPTS[agent.toUpperCase()];
        if (promptName && this.langfuse.isEnabled) {
            try {
                const prompt = await this.langfuse.getCompiledPrompt(promptName, variables, { fallback: this.getFallbackPrompt(agent) });
                return prompt;
            }
            catch (error) {
                console.warn(`Failed to get prompt from Langfuse for ${agent}, using fallback`);
            }
        }
        return this.compileFallbackPrompt(agent, variables);
    }
    /**
     * Get fallback prompt for agent
     */
    getFallbackPrompt(agent) {
        const prompts = {
            [AgentModels_1.AgentType.ARCHITECT]: `You are the Architect, a master storyteller who designs narrative structures.
Your role is to create compelling story frameworks with clear themes, arcs, and emotional journeys.
{{seedIdea}}`,
            [AgentModels_1.AgentType.PROFILER]: `You are the Profiler, an expert in character psychology and development.
Your role is to create deep, nuanced characters with authentic motivations and arcs.
Narrative context: {{narrative}}`,
            [AgentModels_1.AgentType.WORLDBUILDER]: `You are the Worldbuilder, a creator of immersive settings and worlds.
Your role is to develop rich, consistent worlds that enhance the narrative.
Narrative: {{narrative}}
Characters: {{characters}}`,
            [AgentModels_1.AgentType.STRATEGIST]: `You are the Strategist, a master of narrative pacing and scene structure.
Your role is to plan scenes that maximize dramatic impact and reader engagement.
Narrative: {{narrative}}
Characters: {{characters}}
World: {{worldbuilding}}`,
            [AgentModels_1.AgentType.WRITER]: `You are the Writer, a skilled prose craftsman.
Your role is to transform outlines into vivid, engaging prose that brings the story to life.
Maintain consistency with established facts.
Key Constraints: {{keyConstraints}}`,
            [AgentModels_1.AgentType.CRITIC]: `You are the Critic, an expert literary evaluator.
Your role is to assess prose quality and provide constructive feedback for improvement.
Check for constraint violations.
Key Constraints: {{keyConstraints}}`,
            [AgentModels_1.AgentType.ORIGINALITY]: `You are the Originality Checker, a detector of cliches and tropes.
Your role is to identify overused elements and suggest unique alternatives.`,
            [AgentModels_1.AgentType.IMPACT]: `You are the Impact Assessor, an expert in emotional resonance.
Your role is to evaluate how effectively the prose engages readers emotionally.`,
            [AgentModels_1.AgentType.ARCHIVIST]: `You are the Archivist, the keeper of story continuity.
Your role is to track key facts and constraints, resolving conflicts to maintain consistency.
Use Chain of Thought reasoning: IDENTIFY conflicts → RESOLVE by timestamp → DISCARD irrelevant → GENERATE updated list.`,
        };
        return prompts[agent] ?? "You are a helpful assistant.";
    }
    /**
     * Compile fallback prompt with variables
     */
    compileFallbackPrompt(agent, variables) {
        let prompt = this.getFallbackPrompt(agent);
        for (const [key, value] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
        return prompt;
    }
    /**
     * Check if critique approves the scene
     * Uses revision_needed flag from CriticAgent output
     */
    isApproved(critique) {
        // Check revision_needed flag (inverted - if revision_needed is false, it's approved)
        if (critique.revision_needed === false)
            return true;
        // Fallback to old format
        if (critique.approved === true)
            return true;
        if (typeof critique.score === "number" && critique.score >= 8)
            return true;
        return false;
    }
    /**
     * Publish event to Redis Streams
     */
    async publishEvent(runId, eventType, data) {
        // Only log scene events in development for debugging duplication issues
        if (process.env.NODE_ENV !== 'production' && eventType.startsWith('scene_')) {
            console.log(`[StorytellerOrchestrator] Publishing ${eventType}:`, {
                runId,
                sceneNum: data.sceneNum,
                polishStatus: data.polishStatus,
                hasFinalContent: !!data.finalContent,
                wordCount: data.wordCount,
            });
        }
        await this.redisStreams.publishEvent(runId, eventType, data);
    }
    /**
     * Publish phase start event
     */
    async publishPhaseStart(runId, phase) {
        await this.publishEvent(runId, "phase_start", { phase });
        this.langfuse.addEvent(runId, "phase_start", { phase });
    }
    /**
     * Publish phase complete event
     */
    async publishPhaseComplete(runId, phase, artifact) {
        await this.publishEvent(runId, "phase_complete", { phase, artifact });
        this.langfuse.addEvent(runId, "phase_complete", { phase });
    }
    /**
     * Save artifact to Supabase
     */
    async saveArtifact(runId, projectId, artifactType, content) {
        try {
            await this.supabase.saveRunArtifact({
                runId,
                projectId,
                artifactType,
                content,
            });
        }
        catch (error) {
            console.error(`Failed to save artifact ${artifactType}:`, error);
        }
    }
    /**
     * Handle generation error
     *
     * IMPORTANT: Publishes ERROR event to Redis Stream so clients don't hang forever
     * Client should check for event.type === "ERROR" and stop waiting
     */
    async handleError(runId, error) {
        const state = this.activeRuns.get(runId);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        if (state) {
            state.error = errorMessage;
            state.updatedAt = new Date().toISOString();
        }
        // Publish detailed ERROR event - clients MUST check for this
        // Event type "ERROR" (uppercase) signals terminal failure
        await this.publishEvent(runId, "ERROR", {
            error: errorMessage,
            stack: errorStack,
            phase: state?.phase ?? "unknown",
            currentScene: state?.currentScene ?? 0,
            totalScenes: state?.totalScenes ?? 0,
            recoverable: false,
            timestamp: new Date().toISOString(),
        });
        // Also publish generation_error for backwards compatibility
        await this.publishEvent(runId, "generation_error", {
            error: errorMessage,
        });
        // End Langfuse trace with error status
        this.langfuse.endTrace(runId, {
            status: "error",
            error: errorMessage,
            phase: state?.phase,
            currentScene: state?.currentScene,
        });
        // Score the trace as failed for analytics
        this.langfuse.scoreTrace(runId, "success", 0, `Generation failed: ${errorMessage}`);
    }
    /**
     * Check if generation should stop
     */
    shouldStop(runId) {
        const state = this.activeRuns.get(runId);
        if (!state) {
            common_1.$log.info(`[StorytellerOrchestrator] shouldStop: state not found, returning true, runId: ${runId}`);
            return true;
        }
        if (state.isPaused) {
            common_1.$log.info(`[StorytellerOrchestrator] shouldStop: isPaused=true, returning true, runId: ${runId}`);
            return true;
        }
        if (state.error) {
            common_1.$log.info(`[StorytellerOrchestrator] shouldStop: error=${state.error}, returning true, runId: ${runId}`);
            return true;
        }
        const pauseCallback = this.pauseCallbacks.get(runId);
        if (pauseCallback && pauseCallback()) {
            common_1.$log.info(`[StorytellerOrchestrator] shouldStop: pauseCallback returned true, runId: ${runId}`);
            state.isPaused = true;
            return true;
        }
        return false;
    }
    /**
     * Parse JSON from LLM response
     */
    parseJSON(response) {
        try {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1].trim());
            }
            return JSON.parse(response);
        }
        catch (error) {
            console.warn("Failed to parse JSON response:", error);
            return { raw: response };
        }
    }
    /**
     * Parse JSON array from LLM response
     */
    parseJSONArray(response) {
        const parsed = this.parseJSON(response);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed.characters && Array.isArray(parsed.characters)) {
            return parsed.characters;
        }
        return [parsed];
    }
    // ==================== PUBLIC API ====================
    /**
     * Get run status
     */
    getRunStatus(runId) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return null;
        return {
            runId: state.runId,
            projectId: state.projectId,
            phase: state.phase,
            currentScene: state.currentScene,
            totalScenes: state.totalScenes,
            isPaused: state.isPaused,
            isCompleted: state.isCompleted,
            error: state.error,
            startedAt: state.startedAt,
            updatedAt: state.updatedAt,
        };
    }
    /**
     * Get full run state (for recovery)
     */
    getRunState(runId) {
        return this.activeRuns.get(runId) ?? null;
    }
    /**
     * Pause a run
     */
    pauseRun(runId) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return false;
        state.isPaused = true;
        state.updatedAt = new Date().toISOString();
        return true;
    }
    /**
     * Resume a run
     */
    resumeRun(runId) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return false;
        state.isPaused = false;
        state.updatedAt = new Date().toISOString();
        return true;
    }
    /**
     * Cancel a run
     */
    cancelRun(runId) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return false;
        state.error = "Cancelled by user";
        state.updatedAt = new Date().toISOString();
        this.activeRuns.delete(runId);
        return true;
    }
    /**
     * Restore a run from saved state
     */
    restoreRun(state) {
        this.activeRuns.set(state.runId, state);
    }
    /**
     * List active runs
     */
    listActiveRuns() {
        return Array.from(this.activeRuns.values()).map((state) => ({
            runId: state.runId,
            projectId: state.projectId,
            phase: state.phase,
            currentScene: state.currentScene,
            totalScenes: state.totalScenes,
            isPaused: state.isPaused,
            isCompleted: state.isCompleted,
            error: state.error,
            startedAt: state.startedAt,
            updatedAt: state.updatedAt,
        }));
    }
    // ==================== GRACEFUL SHUTDOWN ====================
    /**
     * Initiate graceful shutdown
     *
     * Pauses all active runs and saves their state to Supabase.
     * When the service restarts, runs can be restored using restoreRun().
     *
     * @param timeoutMs - Maximum time to wait for runs to pause (default: 30s)
     * @returns Number of runs that were saved
     */
    async gracefulShutdown(timeoutMs = 30000) {
        console.log(`Orchestrator: Initiating graceful shutdown (timeout: ${timeoutMs}ms)`);
        this.isShuttingDown = true;
        const activeRuns = Array.from(this.activeRuns.values());
        if (activeRuns.length === 0) {
            console.log("Orchestrator: No active runs to save");
            return 0;
        }
        console.log(`Orchestrator: Saving ${activeRuns.length} active runs...`);
        // Pause all runs
        for (const state of activeRuns) {
            state.isPaused = true;
            state.updatedAt = new Date().toISOString();
            // Notify clients that we're shutting down
            await this.publishEvent(state.runId, "shutdown_initiated", {
                message: "Server is restarting. Your generation will resume automatically.",
                phase: state.phase,
                currentScene: state.currentScene,
            });
        }
        // Wait for any in-flight LLM calls to complete (with timeout)
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            // Check if all runs have reached a safe checkpoint
            const allSafe = activeRuns.every((state) => {
                // A run is "safe" if it's paused and not in the middle of an LLM call
                return state.isPaused;
            });
            if (allSafe)
                break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        // Save all run states to Supabase for recovery
        let savedCount = 0;
        for (const state of activeRuns) {
            try {
                // Serialize the state (Maps need special handling)
                const serializedState = {
                    ...state,
                    drafts: Object.fromEntries(state.drafts),
                    critiques: Object.fromEntries(state.critiques),
                    revisionCount: Object.fromEntries(state.revisionCount),
                };
                await this.supabase.saveRunArtifact({
                    runId: state.runId,
                    projectId: state.projectId,
                    artifactType: "run_state_snapshot",
                    content: serializedState,
                });
                savedCount++;
                console.log(`Orchestrator: Saved state for run ${state.runId}`);
            }
            catch (error) {
                console.error(`Orchestrator: Failed to save state for run ${state.runId}:`, error);
            }
        }
        // Flush Langfuse events
        await this.langfuse.flush();
        console.log(`Orchestrator: Graceful shutdown complete. Saved ${savedCount}/${activeRuns.length} runs.`);
        return savedCount;
    }
    /**
     * Restore runs from saved state after restart
     *
     * Call this on service startup to recover any runs that were
     * interrupted by a shutdown/restart.
     *
     * @param runId - Optional: restore a specific run by ID
     * @returns Number of runs restored
     */
    async restoreFromShutdown(runId) {
        console.log("Orchestrator: Checking for runs to restore...");
        try {
            // If no runId provided, we can't restore (would need a list endpoint)
            if (!runId) {
                console.log("Orchestrator: No runId provided for restoration");
                return 0;
            }
            // Get saved run state from Supabase
            const artifact = await this.supabase.getRunArtifact(runId, "run_state_snapshot");
            if (!artifact) {
                console.log("Orchestrator: No saved run state found");
                return 0;
            }
            try {
                const artifactData = artifact;
                const savedState = artifactData.content;
                // Deserialize the state (restore Maps from serialized objects)
                const draftsObj = savedState.drafts || {};
                const critiquesObj = savedState.critiques || {};
                const revisionObj = savedState.revisionCount || {};
                const state = {
                    ...savedState,
                    drafts: new Map(Object.entries(draftsObj).map(([k, v]) => [parseInt(k, 10), v])),
                    critiques: new Map(Object.entries(critiquesObj).map(([k, v]) => [parseInt(k, 10), v])),
                    revisionCount: new Map(Object.entries(revisionObj).map(([k, v]) => [parseInt(k, 10), v])),
                    isPaused: true, // Keep paused until explicitly resumed
                };
                this.activeRuns.set(state.runId, state);
                // Notify clients that the run is restored
                await this.publishEvent(state.runId, "run_restored", {
                    message: "Generation restored after server restart. Call resume to continue.",
                    phase: state.phase,
                    currentScene: state.currentScene,
                });
                console.log(`Orchestrator: Restored run ${state.runId} (phase: ${state.phase})`);
                return 1;
            }
            catch (error) {
                console.error(`Orchestrator: Failed to restore run from artifact:`, error);
                return 0;
            }
        }
        catch (error) {
            console.error("Orchestrator: Error restoring runs:", error);
            return 0;
        }
    }
    /**
     * Restore ALL interrupted runs from saved state after restart
     *
     * Call this on service startup to recover any runs that were
     * interrupted by a shutdown/restart.
     *
     * @returns Number of runs restored
     */
    async restoreAllInterruptedRuns() {
        console.log("Orchestrator: Checking for ALL interrupted runs to restore...");
        try {
            // Get all interrupted run snapshots from Supabase
            const snapshots = await this.supabase.getInterruptedRunSnapshots();
            if (snapshots.length === 0) {
                console.log("Orchestrator: No interrupted runs found to restore");
                return 0;
            }
            console.log(`Orchestrator: Found ${snapshots.length} interrupted runs to restore`);
            let restoredCount = 0;
            for (const snapshot of snapshots) {
                try {
                    const savedState = snapshot.content;
                    // Check if this run is already active (shouldn't happen, but safety check)
                    if (this.activeRuns.has(snapshot.run_id)) {
                        console.log(`Orchestrator: Run ${snapshot.run_id} already active, skipping`);
                        continue;
                    }
                    // Deserialize the state (restore Maps from serialized objects)
                    const draftsObj = savedState.drafts || {};
                    const critiquesObj = savedState.critiques || {};
                    const revisionObj = savedState.revisionCount || {};
                    const state = {
                        ...savedState,
                        runId: snapshot.run_id,
                        projectId: snapshot.project_id,
                        drafts: new Map(Object.entries(draftsObj).map(([k, v]) => [parseInt(k, 10), v])),
                        critiques: new Map(Object.entries(critiquesObj).map(([k, v]) => [parseInt(k, 10), v])),
                        revisionCount: new Map(Object.entries(revisionObj).map(([k, v]) => [parseInt(k, 10), v])),
                        isPaused: true, // Keep paused until explicitly resumed
                    };
                    this.activeRuns.set(state.runId, state);
                    // Notify clients that the run is restored
                    await this.publishEvent(state.runId, "run_restored", {
                        message: "Generation restored after server restart. Call resume to continue.",
                        phase: state.phase,
                        currentScene: state.currentScene,
                    });
                    console.log(`Orchestrator: Restored run ${state.runId} (phase: ${state.phase}, scene: ${state.currentScene})`);
                    restoredCount++;
                }
                catch (error) {
                    console.error(`Orchestrator: Failed to restore run ${snapshot.run_id}:`, error);
                }
            }
            console.log(`Orchestrator: Successfully restored ${restoredCount}/${snapshots.length} interrupted runs`);
            return restoredCount;
        }
        catch (error) {
            console.error("Orchestrator: Error restoring interrupted runs:", error);
            return 0;
        }
    }
    /**
     * Check if shutdown is in progress
     */
    get shuttingDown() {
        return this.isShuttingDown;
    }
};
exports.StorytellerOrchestrator = StorytellerOrchestrator;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", LLMProviderService_1.LLMProviderService)
], StorytellerOrchestrator.prototype, "llmProvider", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", RedisStreamsService_1.RedisStreamsService)
], StorytellerOrchestrator.prototype, "redisStreams", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", QdrantMemoryService_1.QdrantMemoryService)
], StorytellerOrchestrator.prototype, "qdrantMemory", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", LangfuseService_1.LangfuseService)
], StorytellerOrchestrator.prototype, "langfuse", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", SupabaseService_1.SupabaseService)
], StorytellerOrchestrator.prototype, "supabase", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", MetricsService_1.MetricsService)
], StorytellerOrchestrator.prototype, "metricsService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", AgentFactory_1.AgentFactory)
], StorytellerOrchestrator.prototype, "agentFactory", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", EvaluationService_1.EvaluationService)
], StorytellerOrchestrator.prototype, "evaluationService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", WorldBibleEmbeddingService_1.WorldBibleEmbeddingService)
], StorytellerOrchestrator.prototype, "worldBibleEmbedding", void 0);
exports.StorytellerOrchestrator = StorytellerOrchestrator = __decorate([
    (0, di_1.Service)()
], StorytellerOrchestrator);
//# sourceMappingURL=StorytellerOrchestrator.js.map