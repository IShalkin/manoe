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
const AgentFactory_1 = require("../agents/AgentFactory");
const schemaNormalizers_1 = require("../utils/schemaNormalizers");
let StorytellerOrchestrator = class StorytellerOrchestrator {
    activeRuns = new Map();
    pauseCallbacks = new Map();
    isShuttingDown = false;
    llmProvider;
    redisStreams;
    qdrantMemory;
    langfuse;
    supabase;
    agentFactory;
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
        // Initialize Qdrant memory with API key for embeddings
        await this.qdrantMemory.connect(options.llmConfig.provider === LLMModels_1.LLMProvider.OPENAI ? options.llmConfig.apiKey : undefined, options.llmConfig.provider === LLMModels_1.LLMProvider.GEMINI ? options.llmConfig.apiKey : undefined);
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
            await this.publishEvent(runId, "generation_completed", {
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
        common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase: calling agent.execute, runId: ${runId}, phase: ${state.phase}`);
        const output = await agent.execute(context, options);
        common_1.$log.info(`[StorytellerOrchestrator] runGenesisPhase: agent.execute completed, runId: ${runId}`);
        state.narrative = output.content;
        state.updatedAt = new Date().toISOString();
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
        if (narrative.genre) {
            state.keyConstraints.push({
                key: "genre",
                value: String(narrative.genre),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        if (narrative.premise) {
            state.keyConstraints.push({
                key: "premise",
                value: String(narrative.premise),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        if (narrative.tone) {
            state.keyConstraints.push({
                key: "tone",
                value: String(narrative.tone),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        if (narrative.arc) {
            state.keyConstraints.push({
                key: "narrative_arc",
                value: String(narrative.arc),
                sceneNumber: 0,
                timestamp,
                immutable: true,
            });
        }
        common_1.$log.info(`[StorytellerOrchestrator] Added ${state.keyConstraints.length} seed constraints`);
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
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: calling agent.execute, runId: ${runId}`);
        const output = await agent.execute(context, options);
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: agent.execute completed, output.content type: ${typeof output.content}, isArray: ${Array.isArray(output.content)}, runId: ${runId}`);
        state.characters = output.content;
        state.updatedAt = new Date().toISOString();
        // Store characters in Qdrant for semantic search
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: storing ${state.characters?.length || 0} characters in Qdrant, runId: ${runId}`);
        try {
            if (Array.isArray(state.characters)) {
                for (const character of state.characters) {
                    common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: storing character in Qdrant, runId: ${runId}`);
                    await this.qdrantMemory.storeCharacter(options.projectId, character);
                }
            }
            else {
                common_1.$log.warn(`[StorytellerOrchestrator] runCharactersPhase: state.characters is not an array, skipping Qdrant storage, runId: ${runId}`);
            }
        }
        catch (qdrantError) {
            common_1.$log.error(`[StorytellerOrchestrator] runCharactersPhase: Qdrant storage failed, continuing anyway, runId: ${runId}`, qdrantError);
        }
        common_1.$log.info(`[StorytellerOrchestrator] runCharactersPhase: saving artifact, runId: ${runId}`);
        await this.saveArtifact(runId, options.projectId, "characters", state.characters);
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
        const output = await agent.execute(context, options);
        state.worldbuilding = output.content;
        state.updatedAt = new Date().toISOString();
        // Store worldbuilding elements in Qdrant
        const worldData = state.worldbuilding;
        for (const [elementType, element] of Object.entries(worldData)) {
            if (typeof element === "object" && element !== null) {
                await this.qdrantMemory.storeWorldbuilding(options.projectId, elementType, element);
            }
        }
        await this.saveArtifact(runId, options.projectId, "worldbuilding", state.worldbuilding);
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
     * 1. Word count validation with expansion loop before Critic
     * 2. Polish only runs if scene was approved (not after failed revisions)
     * 3. Strips fake "Word count:" claims from Writer output
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
            // Draft the scene
            await this.draftScene(runId, options, sceneNum + 1, scene);
            if (this.shouldStop(runId))
                return;
            // Word count expansion loop - expand if too short before calling Critic
            // This prevents the Critic↔Writer deadlock where Writer can't produce enough words
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
            // Polish the scene ONLY if it was approved
            // This prevents Polish from shortening scenes that already failed quality checks
            if (sceneApproved) {
                await this.polishScene(runId, options, sceneNum + 1);
            }
            else {
                console.log(`[Orchestrator] Scene ${sceneNum + 1} not approved after ${revisionCount} revisions, skipping polish`);
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
        // CRITICAL: Set currentSceneOutline at the start of each scene
        // This ensures WriterAgent always has the correct outline for this scene
        // and prevents state contamination from previous scenes
        state.currentSceneOutline = sceneOutline;
        await this.publishEvent(runId, "scene_draft_start", { sceneNum });
        const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);
        // Note: Characters are already available in state.characters from the Characters phase.
        // WriterAgent accesses them via context.state. Qdrant semantic search is used for
        // cross-project "eternal memory" but not needed in the hot path since all characters
        // for this run are already in memory.
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
        // Extract and log raw facts
        await this.extractRawFacts(runId, sceneNum, response, AgentModels_1.AgentType.WRITER);
        // Store scene in Qdrant
        await this.qdrantMemory.storeScene(options.projectId, sceneNum, draft);
        await this.saveArtifact(runId, options.projectId, `draft_scene_${sceneNum}`, draft);
        await this.publishEvent(runId, "scene_draft_complete", { sceneNum, wordCount: draft.wordCount });
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
        const combinedContent = existingContent + "\n\n" + continuation;
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
     * Validate polish output to prevent chunk loss
     * Returns true if polish is acceptable, false if we should fall back to pre-polish draft
     */
    validatePolishOutput(prePolishContent, polishedContent, prePolishWordCount, polishedWordCount) {
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
        state.lastArchivistScene = upToScene;
        state.updatedAt = new Date().toISOString();
        await this.publishEvent(runId, "archivist_complete", {
            upToScene,
            constraintCount: state.keyConstraints.length,
        });
    }
    /**
     * Extract raw facts from generated content
     */
    async extractRawFacts(runId, sceneNum, content, source) {
        const state = this.activeRuns.get(runId);
        if (!state)
            return;
        // Simple fact extraction - in production, use LLM for better extraction
        const factPatterns = [
            /(\w+) (was|is|became|had|has) (wounded|injured|killed|married|born|died)/gi,
            /(\w+)'s (health|status|location|relationship) (changed|is|was)/gi,
        ];
        for (const pattern of factPatterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                state.rawFactsLog.push({
                    fact: match[0],
                    source,
                    sceneNumber: sceneNum,
                    timestamp: new Date().toISOString(),
                });
            }
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
    __metadata("design:type", AgentFactory_1.AgentFactory)
], StorytellerOrchestrator.prototype, "agentFactory", void 0);
exports.StorytellerOrchestrator = StorytellerOrchestrator = __decorate([
    (0, di_1.Service)()
], StorytellerOrchestrator);
//# sourceMappingURL=StorytellerOrchestrator.js.map