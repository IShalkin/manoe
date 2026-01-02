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

import { Service, Inject } from "@tsed/di";
import { $log } from "@tsed/common";
import { v4 as uuidv4 } from "uuid";
import {
  GenerationPhase,
  LLMProvider,
  ChatMessage,
  MessageRole,
  getMaxTokensForPhase,
} from "../models/LLMModels";
import {
  AgentType,
  AgentMessage,
  MessageType,
  GenerationState,
  KeyConstraint,
  RawFact,
  AGENT_CONFIGS,
  PHASE_CONFIGS,
  getPhaseConfig,
  getNextPhase,
} from "../models/AgentModels";
import { LLMProviderService } from "./LLMProviderService";
import { RedisStreamsService } from "./RedisStreamsService";
import { QdrantMemoryService } from "./QdrantMemoryService";
import { LangfuseService, AGENT_PROMPTS, PHASE_PROMPTS } from "./LangfuseService";
import { SupabaseService, Character, Draft } from "./SupabaseService";
import { MetricsService } from "./MetricsService";
import { AgentFactory } from "../agents/AgentFactory";
import { AgentContext } from "../agents/types";
import { safeParseWordCount } from "../utils/schemaNormalizers";
import { ArchivistAgent } from "../agents/ArchivistAgent";
import { EvaluationService } from "./EvaluationService";

/**
 * Simple rate limiter for concurrent async operations
 * Limits the number of concurrent promises to avoid hitting API rate limits
 */
function createRateLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      const resolve = queue.shift()!;
      resolve();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
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
      } else {
        queue.push(run);
      }
    });
  };
}

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

@Service()
export class StorytellerOrchestrator {
  private activeRuns: Map<string, GenerationState> = new Map();
  private pauseCallbacks: Map<string, () => boolean> = new Map();
  private isShuttingDown: boolean = false;
  
  // Shared rate limiter for all evaluation calls (max 3 concurrent)
  // This ensures consistent rate limiting across relevance and faithfulness evaluations
  private evaluationRateLimiter = createRateLimiter(3);

  @Inject()
  private llmProvider: LLMProviderService;

  @Inject()
  private redisStreams: RedisStreamsService;

  @Inject()
  private qdrantMemory: QdrantMemoryService;

  @Inject()
  private langfuse: LangfuseService;

  @Inject()
  private supabase: SupabaseService;

  @Inject()
  private metricsService: MetricsService;

  @Inject()
  private agentFactory: AgentFactory;

  @Inject()
  private evaluationService: EvaluationService;

  /**
   * Start a new generation run
   * 
   * @param options - Generation options including project ID, seed idea, and LLM config
   * @returns Run ID
   */
  async startGeneration(options: GenerationOptions): Promise<string> {
    const runId = uuidv4();
    process.stdout.write(`[StorytellerOrchestrator] startGeneration called, runId: ${runId}, projectId: ${options.projectId}\n`);
    $log.info(`[StorytellerOrchestrator] startGeneration called, runId: ${runId}, projectId: ${options.projectId}`);

    // Initialize generation state
    const state: GenerationState = {
      phase: GenerationPhase.GENESIS,
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
    $log.info(`[StorytellerOrchestrator] startGeneration: state initialized and stored, runId: ${runId}`);

    // Initialize Qdrant memory with API key for embeddings
    await this.qdrantMemory.connect(
      options.llmConfig.provider === LLMProvider.OPENAI ? options.llmConfig.apiKey : undefined,
      options.llmConfig.provider === LLMProvider.GEMINI ? options.llmConfig.apiKey : undefined
    );

    // Start Langfuse trace
    this.langfuse.startTrace({
      projectId: options.projectId,
      runId,
      phase: GenerationPhase.GENESIS,
    });

    // Publish start event
    await this.publishEvent(runId, "generation_started", {
      projectId: options.projectId,
      mode: options.mode,
      phase: GenerationPhase.GENESIS,
    });

    // Start generation in background
    $log.info(`[StorytellerOrchestrator] startGeneration: starting async runGeneration, runId: ${runId}`);
    this.runGeneration(runId, options).catch((error) => {
      $log.error(`[StorytellerOrchestrator] startGeneration: runGeneration error, runId: ${runId}`, error);
      this.handleError(runId, error);
    });

    return runId;
  }

  /**
   * Main generation loop
   */
  private async runGeneration(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    $log.info(`[StorytellerOrchestrator] runGeneration started, runId: ${runId}`);
    const state = this.activeRuns.get(runId);
    if (!state) {
      $log.error(`[StorytellerOrchestrator] runGeneration: state not found, runId: ${runId}`);
      return;
    }

    try {
      // Phase 1: Genesis
      $log.info(`[StorytellerOrchestrator] runGeneration: about to call runGenesisPhase, runId: ${runId}`);
      await this.runGenesisPhase(runId, options);
      $log.info(`[StorytellerOrchestrator] runGeneration: runGenesisPhase completed, runId: ${runId}`);
      const shouldStopAfterGenesis = this.shouldStop(runId);
      $log.info(`[StorytellerOrchestrator] runGeneration: shouldStop after Genesis = ${shouldStopAfterGenesis}, runId: ${runId}`);
      if (shouldStopAfterGenesis) {
        $log.info(`[StorytellerOrchestrator] runGeneration: shouldStop after Genesis, exiting, runId: ${runId}`);
        return;
      }

      // Phase 2: Characters
      $log.info(`[StorytellerOrchestrator] runGeneration: about to call runCharactersPhase, runId: ${runId}`);
      await this.runCharactersPhase(runId, options);
      $log.info(`[StorytellerOrchestrator] runGeneration: runCharactersPhase completed, runId: ${runId}`);
      if (this.shouldStop(runId)) return;

      // Phase 3: Worldbuilding
      await this.runWorldbuildingPhase(runId, options);
      if (this.shouldStop(runId)) return;

      // Phase 4: Outlining
      await this.runOutliningPhase(runId, options);
      if (this.shouldStop(runId)) return;

      // Phase 5: Advanced Planning (optional)
      await this.runAdvancedPlanningPhase(runId, options);
      if (this.shouldStop(runId)) return;

      // Phase 6-9: Drafting → Critique → Revision → Polish (per scene)
      await this.runDraftingLoop(runId, options);
      if (this.shouldStop(runId)) return;

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
    } catch (error) {
      await this.handleError(runId, error);
    }
  }

  /**
   * Genesis Phase - Initial story concept
   */
  private async runGenesisPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    $log.info(`[StorytellerOrchestrator] runGenesisPhase called, runId: ${runId}`);
    const state = this.activeRuns.get(runId);
    if (!state) {
      $log.error(`[StorytellerOrchestrator] runGenesisPhase: state not found for runId: ${runId}`);
      return;
    }

    state.phase = GenerationPhase.GENESIS;
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: phase set to GENESIS, runId: ${runId}`);
    await this.publishPhaseStart(runId, GenerationPhase.GENESIS);

    // Use ArchitectAgent through AgentFactory
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: getting ArchitectAgent from factory, runId: ${runId}`);
    const agent = this.agentFactory.getAgent(AgentType.ARCHITECT);
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: ArchitectAgent obtained, runId: ${runId}`);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const startTime = Date.now();
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: calling agent.execute, runId: ${runId}, phase: ${state.phase}`);
    try {
      const output = await agent.execute(context, options);
      const durationMs = Date.now() - startTime;
      $log.info(`[StorytellerOrchestrator] runGenesisPhase: agent.execute completed, runId: ${runId}`);
      
      // Record successful agent execution metrics
      this.metricsService.recordAgentExecution({
        agentName: AgentType.ARCHITECT,
        runId,
        projectId: options.projectId,
        success: true,
        durationMs,
      });
      
      state.narrative = output.content as Record<string, unknown>;
      state.updatedAt = new Date().toISOString();
    } catch (error) {
      const durationMs = Date.now() - startTime;
      // Record failed agent execution metrics
      this.metricsService.recordAgentExecution({
        agentName: AgentType.ARCHITECT,
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

    await this.publishPhaseComplete(runId, GenerationPhase.GENESIS, state.narrative);
  }

  /**
   * Add immutable seed constraints from Genesis phase
   * These constraints have sceneNumber=0 and are never overwritten by Archivist
   * Prevents context drift where LLM "forgets" the original story concept
   */
  private addSeedConstraints(state: GenerationState, seedIdea: string): void {
    const narrative = state.narrative as Record<string, unknown>;
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

    $log.info(`[StorytellerOrchestrator] Added ${state.keyConstraints.length} seed constraints`);
  }

  /**
   * Extract string value from a field that might be string or object
   * Handles cases where LLM returns {name: "...", description: "..."} instead of plain string
   * Prevents [object Object] serialization issues in constraints
   */
  private extractStringValue(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      // Try common field names that LLMs use
      if (typeof obj.name === "string") return obj.name;
      if (typeof obj.theme === "string") return obj.theme;
      if (typeof obj.description === "string") return obj.description;
      if (typeof obj.type === "string") return obj.type;
      if (typeof obj.structure === "string") return obj.structure;
      // Fallback to JSON stringification for complex objects
      return JSON.stringify(value);
    }
    return "";
  }

  /**
   * Characters Phase - Character creation
   */
  private async runCharactersPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    $log.info(`[StorytellerOrchestrator] runCharactersPhase called, runId: ${runId}`);
    const state = this.activeRuns.get(runId);
    if (!state || !state.narrative) {
      $log.info(`[StorytellerOrchestrator] runCharactersPhase: state or narrative not found, returning, runId: ${runId}`);
      return;
    }

    state.phase = GenerationPhase.CHARACTERS;
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: phase set to CHARACTERS, runId: ${runId}`);
    await this.publishPhaseStart(runId, GenerationPhase.CHARACTERS);

    // Use ProfilerAgent through AgentFactory
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: getting ProfilerAgent from factory, runId: ${runId}`);
    const agent = this.agentFactory.getAgent(AgentType.PROFILER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const startTime = Date.now();
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: calling agent.execute, runId: ${runId}`);
    try {
      const output = await agent.execute(context, options);
      const durationMs = Date.now() - startTime;
      $log.info(`[StorytellerOrchestrator] runCharactersPhase: agent.execute completed, output.content type: ${typeof output.content}, isArray: ${Array.isArray(output.content)}, runId: ${runId}`);
      
      // Record successful agent execution metrics
      this.metricsService.recordAgentExecution({
        agentName: AgentType.PROFILER,
        runId,
        projectId: options.projectId,
        success: true,
        durationMs,
      });
      
      state.characters = output.content as Record<string, unknown>[];
      state.updatedAt = new Date().toISOString();
    } catch (error) {
      const durationMs = Date.now() - startTime;
      // Record failed agent execution metrics
      this.metricsService.recordAgentExecution({
        agentName: AgentType.PROFILER,
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
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: storing ${state.characters?.length || 0} characters, runId: ${runId}`);
    try {
      if (Array.isArray(state.characters)) {
        for (const character of state.characters) {
          // Store in Qdrant first (returns pointId)
          $log.info(`[StorytellerOrchestrator] runCharactersPhase: storing character in Qdrant, runId: ${runId}`);
          const qdrantId = await this.qdrantMemory.storeCharacter(options.projectId, character);

          // Store in Supabase with qdrant_id reference and runId for Langfuse tracing
          try {
            await this.supabase.saveCharacter(options.projectId, character as Partial<Character>, qdrantId, runId);
          } catch (supabaseError) {
            $log.error(
              `[StorytellerOrchestrator] runCharactersPhase: Supabase storage failed (continuing anyway), runId: ${runId}`,
              supabaseError
            );
          }
        }
      } else {
        $log.warn(`[StorytellerOrchestrator] runCharactersPhase: state.characters is not an array, skipping storage, runId: ${runId}`);
      }
    } catch (qdrantError) {
      $log.error(`[StorytellerOrchestrator] runCharactersPhase: Storage failed, continuing anyway, runId: ${runId}`, qdrantError);
    }

    $log.info(`[StorytellerOrchestrator] runCharactersPhase: saving artifact, runId: ${runId}`);
    await this.saveArtifact(runId, options.projectId, "characters", state.characters);

    // Phase 5: Save characters to normalized Supabase table
    try {
      if (Array.isArray(state.characters)) {
        await this.supabase.upsertCharacters(options.projectId, runId, state.characters);
        $log.info(`[StorytellerOrchestrator] runCharactersPhase: saved ${state.characters.length} characters to Supabase, runId: ${runId}`);
      }
    } catch (supabaseError) {
      $log.error(`[StorytellerOrchestrator] runCharactersPhase: Supabase upsertCharacters failed, continuing anyway, runId: ${runId}`, supabaseError);
    }

    // Phase 4: Initialize world state after characters are created
    try {
      if (Array.isArray(state.characters)) {
        const archivistAgent = this.agentFactory.getAgent(AgentType.ARCHIVIST) as ArchivistAgent;
        state.worldState = archivistAgent.buildInitialWorldState(runId, state.characters);
        $log.info(`[StorytellerOrchestrator] runCharactersPhase: initialized world state with ${state.characters.length} characters, runId: ${runId}`);
      }
    } catch (worldStateError) {
      $log.error(`[StorytellerOrchestrator] runCharactersPhase: world state initialization failed, continuing anyway, runId: ${runId}`, worldStateError);
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
            this.evaluationRateLimiter(() => 
              this.evaluationService.evaluateRelevance({
                runId,
                profilerOutput,
                seedIdea: options.seedIdea,
                characterName,
              })
            ).catch((err) => {
              $log.warn(`[StorytellerOrchestrator] Relevance evaluation failed for ${characterName}: ${err.message}`);
            });
          }
          $log.info(`[StorytellerOrchestrator] runCharactersPhase: triggered relevance evaluations for ${state.characters.length} characters (rate limited to 3 concurrent), runId: ${runId}`);
        }
      } catch (evalError) {
        $log.warn(`[StorytellerOrchestrator] runCharactersPhase: evaluation setup failed, continuing anyway, runId: ${runId}`, evalError);
      }
    }

    $log.info(`[StorytellerOrchestrator] runCharactersPhase: publishing phase complete, runId: ${runId}`);
    await this.publishPhaseComplete(runId, GenerationPhase.CHARACTERS, state.characters);
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: completed, runId: ${runId}`);
  }

  /**
   * Worldbuilding Phase - Setting and world details
   */
  private async runWorldbuildingPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.narrative) return;

    state.phase = GenerationPhase.WORLDBUILDING;
    await this.publishPhaseStart(runId, GenerationPhase.WORLDBUILDING);

    // Use WorldbuilderAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WORLDBUILDER);
    const context: AgentContext = {
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
        agentName: AgentType.WORLDBUILDER,
        runId,
        projectId: options.projectId,
        success: true,
        durationMs,
      });
      
      state.worldbuilding = output.content as Record<string, unknown>;
      state.updatedAt = new Date().toISOString();
    } catch (error) {
      const durationMs = Date.now() - startTime;
      // Record failed agent execution metrics
      this.metricsService.recordAgentExecution({
        agentName: AgentType.WORLDBUILDER,
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
    const worldData = state.worldbuilding as Record<string, unknown>;
    for (const [elementType, element] of Object.entries(worldData)) {
      if (typeof element === "object" && element !== null) {
        try {
          // Store in Qdrant first (returns pointId)
          const qdrantId = await this.qdrantMemory.storeWorldbuilding(
            options.projectId,
            elementType,
            element as Record<string, unknown>
          );

          // Store in Supabase with qdrant_id reference and runId for Langfuse tracing
          try {
            await this.supabase.saveWorldbuilding(
              options.projectId,
              elementType,
              element as Record<string, unknown>,
              qdrantId,
              runId
            );
          } catch (supabaseError) {
            $log.error(
              `[StorytellerOrchestrator] runWorldbuildingPhase: Supabase storage failed for ${elementType} (continuing anyway), runId: ${runId}`,
              supabaseError
            );
          }
        } catch (qdrantError) {
          $log.error(
            `[StorytellerOrchestrator] runWorldbuildingPhase: Qdrant storage failed for ${elementType} (continuing anyway), runId: ${runId}`,
            qdrantError
          );
        }
      }
    }

    await this.saveArtifact(runId, options.projectId, "worldbuilding", state.worldbuilding);
    await this.publishPhaseComplete(runId, GenerationPhase.WORLDBUILDING, state.worldbuilding);
  }

  /**
   * Outlining Phase - Scene-by-scene outline
   */
  private async runOutliningPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.narrative) return;

    state.phase = GenerationPhase.OUTLINING;
    await this.publishPhaseStart(runId, GenerationPhase.OUTLINING);

    // Use StrategistAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.STRATEGIST);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    state.outline = output.content as Record<string, unknown>;
    const scenes = (state.outline as Record<string, unknown>)?.scenes;
    state.totalScenes = Array.isArray(scenes) ? scenes.length : 0;
    state.updatedAt = new Date().toISOString();

    await this.saveArtifact(runId, options.projectId, "outline", state.outline);
    await this.publishPhaseComplete(runId, GenerationPhase.OUTLINING, state.outline);
  }

  /**
   * Advanced Planning Phase - Detailed planning with motifs and subtext
   */
  private async runAdvancedPlanningPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.outline) return;

    state.phase = GenerationPhase.ADVANCED_PLANNING;
    await this.publishPhaseStart(runId, GenerationPhase.ADVANCED_PLANNING);

    // Use StrategistAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.STRATEGIST);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const advancedPlan = output.content as Record<string, unknown>;
    state.updatedAt = new Date().toISOString();

    await this.saveArtifact(runId, options.projectId, "advanced_plan", advancedPlan);
    await this.publishPhaseComplete(runId, GenerationPhase.ADVANCED_PLANNING, advancedPlan);
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
  private async runDraftingLoop(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.outline) return;

    const scenes = (state.outline as Record<string, unknown>)?.scenes as unknown[];
    if (!Array.isArray(scenes)) return;

    for (let sceneNum = 0; sceneNum < scenes.length; sceneNum++) {
      if (this.shouldStop(runId)) return;

      state.currentScene = sceneNum + 1;
      const scene = scenes[sceneNum] as Record<string, unknown>;
      
      // Use safeParseWordCount to handle string values like "1,900" and prevent NaN
      const targetWordCount = safeParseWordCount(scene.wordCount, 1500);
      const minWordCount = Math.floor(targetWordCount * 0.7); // 70% threshold

      // PROACTIVE BEATS METHOD: For scenes with target > 1000 words, split into parts upfront
      // This prevents the Writer↔Critic deadlock where LLMs can't produce 1500+ words in one shot
      const BEATS_THRESHOLD = 1000;
      if (targetWordCount > BEATS_THRESHOLD) {
        console.log(`[Orchestrator] Scene ${sceneNum + 1} target ${targetWordCount} words > ${BEATS_THRESHOLD}, using Proactive Beats Method`);
        await this.draftSceneWithBeats(runId, options, sceneNum + 1, scene, targetWordCount);
      } else {
        // Standard single-shot drafting for shorter scenes
        await this.draftScene(runId, options, sceneNum + 1, scene);
      }
      if (this.shouldStop(runId)) return;

      // Word count expansion loop - expand if still too short before calling Critic
      // This is a fallback safety net after beats method or single-shot drafting
      let expansionAttempts = 0;
      const maxExpansions = 3;
      while (expansionAttempts < maxExpansions) {
        const draft = state.drafts.get(sceneNum + 1) as Record<string, unknown>;
        const actualWordCount = draft?.wordCount as number ?? 0;
        
        if (actualWordCount >= minWordCount) break;
        
        console.log(`[Orchestrator] Scene ${sceneNum + 1} too short (${actualWordCount}/${minWordCount} words), expanding...`);
        await this.expandScene(runId, options, sceneNum + 1, scene, targetWordCount - actualWordCount);
        expansionAttempts++;
        if (this.shouldStop(runId)) return;
      }

      // Critique and revision loop (max 2 iterations)
      let revisionCount = 0;
      let sceneApproved = false;
      let approvedCritiqueScore: number | undefined;
      while (revisionCount < state.maxRevisions) {
        if (this.shouldStop(runId)) return;

        // Critique
        const critique = await this.critiqueScene(runId, options, sceneNum + 1);
        if (this.shouldStop(runId)) return;

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
      } else if (sceneApproved && shouldSkipPolish) {
        // CRITICAL: Emit scene_polish_complete even when skipping Polish
        // This ensures frontend always has a canonical source of truth for each scene
        // Without this, frontend falls back to collecting all Writer messages which causes duplication
        console.log(`[Orchestrator] Scene ${sceneNum + 1} has high score (${approvedCritiqueScore}), skipping polish`);
        await this.emitSceneFinal(runId, options.projectId, sceneNum + 1, "skipped_high_score");
      } else {
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
  private async draftScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number,
    sceneOutline: Record<string, unknown>
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    state.phase = GenerationPhase.DRAFTING;
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
      retrievedContext: relevantContext,  // Add Qdrant context for Writer
    };

    // Store scene outline in state for WriterAgent to access
    const outline = state.outline as Record<string, unknown>;
    if (!outline) {
      throw new Error("Outline not found in state");
    }

    // Use WriterAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WRITER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
    const response = this.stripFakeWordCount(output.content as string);

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
    await this.extractRawFacts(runId, sceneNum, response, AgentType.WRITER);

    // Store scene in Qdrant and Supabase
    try {
      const qdrantId = await this.qdrantMemory.storeScene(options.projectId, sceneNum, draft);

      // Store in Supabase with qdrant_id reference and runId for Langfuse tracing
      try {
        await this.supabase.saveDraft(options.projectId, draft as Partial<Draft>, qdrantId, runId);
      } catch (supabaseError) {
        $log.error(
          `[StorytellerOrchestrator] draftScene: Supabase storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`,
          supabaseError
        );
      }
    } catch (qdrantError) {
      $log.error(
        `[StorytellerOrchestrator] draftScene: Qdrant storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`,
        qdrantError
      );
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
      });
      $log.info(`[StorytellerOrchestrator] draftScene: saved draft to Supabase, scene ${sceneNum}, runId: ${runId}`);
    } catch (supabaseError) {
      $log.error(`[StorytellerOrchestrator] draftScene: Supabase upsertDraft failed, continuing anyway, runId: ${runId}`, supabaseError);
    }

    await this.publishEvent(runId, "scene_draft_complete", { sceneNum, wordCount: draft.wordCount });

    // LLM-as-a-Judge: Evaluate faithfulness of Writer output to Architect plan
    // Runs asynchronously to not block generation
    // Uses shared rate limiter (max 3 concurrent) to avoid hitting LLM provider rate limits
    if (process.env.EVALUATION_ENABLED === "true" && this.evaluationService.isEnabled) {
      try {
        const architectPlan = JSON.stringify(sceneOutline, null, 2);
        
        // Fire and forget with rate limiting - don't await to avoid blocking generation
        // Uses shared class-level rate limiter (max 3 concurrent) for all evaluation calls
        this.evaluationRateLimiter(() =>
          this.evaluationService.evaluateFaithfulness({
            runId,
            writerOutput: response,
            architectPlan,
            sceneNumber: sceneNum,
          })
        ).catch((err) => {
          $log.warn(`[StorytellerOrchestrator] Faithfulness evaluation failed for scene ${sceneNum}: ${err.message}`);
        });
        
        $log.info(`[StorytellerOrchestrator] draftScene: triggered faithfulness evaluation for scene ${sceneNum} (rate limited), runId: ${runId}`);
      } catch (evalError) {
        $log.warn(`[StorytellerOrchestrator] draftScene: evaluation setup failed, continuing anyway, runId: ${runId}`, evalError);
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
  private async draftSceneWithBeats(
    runId: string,
    options: GenerationOptions,
    sceneNum: number,
    sceneOutline: Record<string, unknown>,
    targetWordCount: number
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    state.phase = GenerationPhase.DRAFTING;
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
      if (this.shouldStop(runId)) return;

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
        const agent = this.agentFactory.getAgent(AgentType.WRITER);
        const context: AgentContext = {
          runId,
          state,
          projectId: options.projectId,
        };

        const output = await agent.execute(context, options);
        partContent = this.stripFakeWordCount(output.content as string);

        // For parts 2+, strip overlap with existing content
        if (partIndex > 1 && combinedContent) {
          const rawPartContent = partContent;
          const strippedContent = this.stripOverlap(combinedContent, partContent);
          // Handle case where stripOverlap returns empty (LLM repeated all content)
          if (!strippedContent || strippedContent.trim().length === 0) {
            console.warn(`[Orchestrator] Scene ${sceneNum} Part ${partIndex}: stripOverlap returned empty, using raw content`);
            // Keep raw content instead of empty string
          } else {
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
      } else {
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

    // Extract and log raw facts
    await this.extractRawFacts(runId, sceneNum, combinedContent, AgentType.WRITER);

    // Store scene in Qdrant and Supabase (same as draftScene)
    try {
      const qdrantId = await this.qdrantMemory.storeScene(options.projectId, sceneNum, draft);

      try {
        await this.supabase.saveDraft(options.projectId, draft as Partial<Draft>, qdrantId, runId);
      } catch (supabaseError) {
        $log.error(
          `[StorytellerOrchestrator] draftSceneWithBeats: Supabase storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`,
          supabaseError
        );
      }
    } catch (qdrantError) {
      $log.error(
        `[StorytellerOrchestrator] draftSceneWithBeats: Qdrant storage failed for scene ${sceneNum} (continuing anyway), runId: ${runId}`,
        qdrantError
      );
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
      });
      $log.info(`[StorytellerOrchestrator] draftSceneWithBeats: saved draft to Supabase, scene ${sceneNum}, runId: ${runId}`);
    } catch (supabaseError) {
      $log.error(`[StorytellerOrchestrator] draftSceneWithBeats: Supabase upsertDraft failed, continuing anyway, runId: ${runId}`, supabaseError);
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
      partsGenerated: partsTotal
    });

    // LLM-as-a-Judge evaluation (same as draftScene)
    if (process.env.EVALUATION_ENABLED === "true" && this.evaluationService.isEnabled) {
      try {
        const architectPlan = JSON.stringify(sceneOutline, null, 2);
        
        this.evaluationRateLimiter(() =>
          this.evaluationService.evaluateFaithfulness({
            runId,
            writerOutput: combinedContent,
            architectPlan,
            sceneNumber: sceneNum,
          })
        ).catch((err) => {
          $log.warn(`[StorytellerOrchestrator] Faithfulness evaluation failed for scene ${sceneNum}: ${err.message}`);
        });
        
        $log.info(`[StorytellerOrchestrator] draftSceneWithBeats: triggered faithfulness evaluation for scene ${sceneNum} (rate limited), runId: ${runId}`);
      } catch (evalError) {
        $log.warn(`[StorytellerOrchestrator] draftSceneWithBeats: evaluation setup failed, continuing anyway, runId: ${runId}`, evalError);
      }
    }
  }

  /**
   * Critique a scene
   */
  private async critiqueScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number
  ): Promise<Record<string, unknown>> {
    const state = this.activeRuns.get(runId);
    if (!state) return { approved: true };

    const draft = state.drafts.get(sceneNum);
    if (!draft) return { approved: true };

    state.phase = GenerationPhase.CRITIQUE;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_critique_start", { sceneNum });

    // Use CriticAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.CRITIC);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const critique = output.content as Record<string, unknown>;
    
    if (!state.critiques.has(sceneNum)) {
      state.critiques.set(sceneNum, []);
    }
    state.critiques.get(sceneNum)!.push(critique);
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
      $log.info(`[StorytellerOrchestrator] critiqueScene: saved critique to Supabase, scene ${sceneNum}, runId: ${runId}`);
    } catch (supabaseError) {
      $log.error(`[StorytellerOrchestrator] critiqueScene: Supabase saveCritique failed, continuing anyway, runId: ${runId}`, supabaseError);
    }

    await this.publishEvent(runId, "scene_critique_complete", { sceneNum, critique });

    return critique;
  }

  /**
   * Revise a scene based on critique
   */
  private async reviseScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number,
    critique: Record<string, unknown>
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    const draft = state.drafts.get(sceneNum);
    if (!draft) return;

    state.phase = GenerationPhase.REVISION;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_revision_start", { sceneNum });

    // Use WriterAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WRITER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
    const response = this.stripFakeWordCount(output.content as string);

    const revision = {
      sceneNum,
      title: (draft as Record<string, unknown>).title,
      content: response,
      wordCount: response.split(/\s+/).length,
      revisionNumber: (state.revisionCount.get(sceneNum) ?? 0) + 1,
      createdAt: new Date().toISOString(),
    };

    state.drafts.set(sceneNum, revision);
    state.updatedAt = new Date().toISOString();

    // Extract new facts from revision
    await this.extractRawFacts(runId, sceneNum, response, AgentType.WRITER);

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
  private async expandScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number,
    sceneOutline: Record<string, unknown>,
    additionalWordsNeeded: number
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    const draft = state.drafts.get(sceneNum) as Record<string, unknown>;
    if (!draft) return;

    state.phase = GenerationPhase.DRAFTING;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_expand_start", { sceneNum, additionalWordsNeeded });

    // CRITICAL: Use the passed sceneOutline instead of spreading stale state
    // This prevents state contamination where Scene 2 would use Scene 1's outline
    state.currentSceneOutline = {
      ...sceneOutline,  // Use the correct scene outline
      expansionMode: true,
      existingContent: draft.content,
      additionalWordsNeeded,
    };

    // Use WriterAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WRITER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    let continuation = output.content as string;

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
      $log.warn(`[StorytellerOrchestrator] stripOverlap returned empty continuation, keeping existing content`);
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
  private stripFakeWordCount(content: string): string {
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
  private stripOverlap(existingContent: string, continuation: string): string {
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
        $log.info(`[StorytellerOrchestrator] Stripped ${overlapEndPosition} chars of overlap from continuation`);
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
            $log.info(`[StorytellerOrchestrator] Stripped overlap using anchor method`);
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
  private async polishScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    const draft = state.drafts.get(sceneNum);
    if (!draft) return;

    state.phase = GenerationPhase.POLISH;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_polish_start", { sceneNum });

    // Store pre-polish content for validation/fallback
    const prePolishContent = String((draft as Record<string, unknown>).content ?? "");
    const prePolishWordCount = prePolishContent.split(/\s+/).length;

    // Use WriterAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WRITER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
    const response = this.stripFakeWordCount(output.content as string);
    const polishedWordCount = response.split(/\s+/).length;

    // POST-POLISH VALIDATION: Check if polish is acceptable
    // Reject polish if it's significantly shorter (lost chunks) or missing ending
    const isPolishAcceptable = this.validatePolishOutput(
      prePolishContent,
      response,
      prePolishWordCount,
      polishedWordCount
    );

    let finalContent: string;
    let finalWordCount: number;
    let polishStatus: string;

    if (isPolishAcceptable) {
      finalContent = response;
      finalWordCount = polishedWordCount;
      polishStatus = "polished";
    } else {
      // FALLBACK: Keep pre-polish draft if polish failed validation
      console.log(`[Orchestrator] Scene ${sceneNum} polish rejected (${polishedWordCount}/${prePolishWordCount} words), keeping pre-polish draft`);
      finalContent = prePolishContent;
      finalWordCount = prePolishWordCount;
      polishStatus = "polish_rejected";
    }

    const polished = {
      sceneNum,
      title: (draft as Record<string, unknown>).title,
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
  private async emitSceneFinal(
    runId: string,
    projectId: string,
    sceneNum: number,
    polishStatus: string
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    const draft = state.drafts.get(sceneNum) as Record<string, unknown> | undefined;
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
  private validatePolishOutput(
    prePolishContent: string,
    polishedContent: string,
    prePolishWordCount: number,
    polishedWordCount: number
  ): boolean {
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
  private async runArchivistCheck(
    runId: string,
    options: GenerationOptions,
    upToScene: number
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    await this.publishEvent(runId, "archivist_start", { upToScene });

    // Get raw facts since last archivist run
    const newFacts = state.rawFactsLog.filter(
      (f) => f.sceneNumber > state.lastArchivistScene && f.sceneNumber <= upToScene
    );

    if (newFacts.length === 0) return;

    state.currentScene = upToScene;

    // Use ArchivistAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.ARCHIVIST);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const result = output.content as Record<string, unknown>;
    
    if (result.constraints && Array.isArray(result.constraints)) {
      // Update constraints from Archivist output
      const newConstraints = result.constraints as KeyConstraint[];
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
        } else {
          state.keyConstraints.push(newConstraint);
        }
      }
    }

    // Phase 4: Apply world state diff from Archivist output
    if (result.worldStateDiff && state.worldState) {
      try {
        const archivistAgent = agent as ArchivistAgent;
        state.worldState = archivistAgent.applyWorldStateDiff(
          state.worldState,
          result.worldStateDiff as Record<string, unknown>,
          upToScene
        );
        $log.info(`[StorytellerOrchestrator] runArchivistCheck: applied world state diff for scene ${upToScene}, runId: ${runId}`);
      } catch (worldStateError) {
        $log.error(`[StorytellerOrchestrator] runArchivistCheck: world state diff application failed, continuing anyway, runId: ${runId}`, worldStateError);
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
  private async extractRawFacts(
    runId: string,
    sceneNum: number,
    content: string,
    source: AgentType
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    console.log(`[extractRawFacts] Called for scene ${sceneNum}, content length: ${content.length}`);

    // Build allowlist of canonical character names from state.characters
    const canonicalNames = new Set<string>();
    if (state.characters && Array.isArray(state.characters)) {
      for (const char of state.characters) {
        const charObj = char as Record<string, unknown>;
        const name = charObj.name as string;
        if (name) {
          // Add full name and first name
          canonicalNames.add(name.toLowerCase());
          const firstName = name.split(' ')[0];
          if (firstName) canonicalNames.add(firstName.toLowerCase());
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

    const newFacts: Array<{ subject: string; change: string; category: 'char' | 'world' | 'plot' }> = [];
    const seenFacts = new Set<string>(); // Deduplicate facts

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
        if (seenFacts.has(factKey)) continue;
        seenFacts.add(factKey);
        
        // Determine category based on action type
        let category: 'char' | 'world' | 'plot' = 'plot';
        const charActions = ['smiled', 'frowned', 'laughed', 'cried', 'sighed', 'nodded', 'shook', 'gasped', 'trembled', 'froze'];
        const worldActions = ['walked', 'ran', 'moved', 'entered', 'left', 'arrived', 'departed', 'stepped', 'approached', 'retreated'];
        const plotActions = ['died', 'killed', 'married', 'betrayed', 'escaped', 'collapsed', 'awakened', 'transformed', 'vanished', 'discovered', 'found', 'learned', 'realized'];
        
        if (charActions.includes(action.toLowerCase())) {
          category = 'char';
        } else if (worldActions.includes(action.toLowerCase())) {
          category = 'world';
        } else if (plotActions.includes(action.toLowerCase())) {
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
  private buildConstraintsBlock(constraints: KeyConstraint[]): string {
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
  private async getRelevantContext(
    projectId: string,
    sceneOutline: Record<string, unknown>
  ): Promise<string> {
    const contextParts: string[] = [];

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
          .filter(r => r.score > 0.5)  // Only include high-relevance matches
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
            const scene = r.payload.scene as Record<string, unknown>;
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
    } catch (error) {
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
  private async callAgent(
    runId: string,
    agent: AgentType,
    systemPrompt: string,
    userPrompt: string,
    llmConfig: LLMConfiguration,
    phase: GenerationPhase
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: MessageRole.SYSTEM, content: systemPrompt },
      { role: MessageRole.USER, content: userPrompt },
    ];

    const spanId = this.langfuse.startSpan(runId, `${agent}_call`, { phase });

    try {
      const response = await this.llmProvider.createCompletionWithRetry({
        messages,
        model: llmConfig.model,
        provider: llmConfig.provider,
        apiKey: llmConfig.apiKey,
        temperature: llmConfig.temperature ?? 0.7,
        maxTokens: getMaxTokensForPhase(phase),
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
          type: MessageType.ARTIFACT,
          content: response.content,
          timestamp: new Date().toISOString(),
        });
      }

      return response.content;
    } catch (error) {
      this.langfuse.endSpan(runId, spanId, { error: String(error) });
      throw error;
    }
  }

  /**
   * Get agent prompt from Langfuse or fallback
   */
  private async getAgentPrompt(
    agent: AgentType,
    variables: Record<string, string>
  ): Promise<string> {
    const promptName = AGENT_PROMPTS[agent.toUpperCase() as keyof typeof AGENT_PROMPTS];
    
    if (promptName && this.langfuse.isEnabled) {
      try {
        const prompt = await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(agent) }
        );
        return prompt;
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${agent}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(agent, variables);
  }

  /**
   * Get fallback prompt for agent
   */
  private getFallbackPrompt(agent: AgentType): string {
    const prompts: Record<AgentType, string> = {
      [AgentType.ARCHITECT]: `You are the Architect, a master storyteller who designs narrative structures.
Your role is to create compelling story frameworks with clear themes, arcs, and emotional journeys.
{{seedIdea}}`,
      [AgentType.PROFILER]: `You are the Profiler, an expert in character psychology and development.
Your role is to create deep, nuanced characters with authentic motivations and arcs.
Narrative context: {{narrative}}`,
      [AgentType.WORLDBUILDER]: `You are the Worldbuilder, a creator of immersive settings and worlds.
Your role is to develop rich, consistent worlds that enhance the narrative.
Narrative: {{narrative}}
Characters: {{characters}}`,
      [AgentType.STRATEGIST]: `You are the Strategist, a master of narrative pacing and scene structure.
Your role is to plan scenes that maximize dramatic impact and reader engagement.
Narrative: {{narrative}}
Characters: {{characters}}
World: {{worldbuilding}}`,
      [AgentType.WRITER]: `You are the Writer, a skilled prose craftsman.
Your role is to transform outlines into vivid, engaging prose that brings the story to life.
Maintain consistency with established facts.
Key Constraints: {{keyConstraints}}`,
      [AgentType.CRITIC]: `You are the Critic, an expert literary evaluator.
Your role is to assess prose quality and provide constructive feedback for improvement.
Check for constraint violations.
Key Constraints: {{keyConstraints}}`,
      [AgentType.ORIGINALITY]: `You are the Originality Checker, a detector of cliches and tropes.
Your role is to identify overused elements and suggest unique alternatives.`,
      [AgentType.IMPACT]: `You are the Impact Assessor, an expert in emotional resonance.
Your role is to evaluate how effectively the prose engages readers emotionally.`,
      [AgentType.ARCHIVIST]: `You are the Archivist, the keeper of story continuity.
Your role is to track key facts and constraints, resolving conflicts to maintain consistency.
Use Chain of Thought reasoning: IDENTIFY conflicts → RESOLVE by timestamp → DISCARD irrelevant → GENERATE updated list.`,
    };

    return prompts[agent] ?? "You are a helpful assistant.";
  }

  /**
   * Compile fallback prompt with variables
   */
  private compileFallbackPrompt(
    agent: AgentType,
    variables: Record<string, string>
  ): string {
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
  private isApproved(critique: Record<string, unknown>): boolean {
    // Check revision_needed flag (inverted - if revision_needed is false, it's approved)
    if (critique.revision_needed === false) return true;
    // Fallback to old format
    if (critique.approved === true) return true;
    if (typeof critique.score === "number" && critique.score >= 8) return true;
    return false;
  }

  /**
   * Publish event to Redis Streams
   */
  private async publishEvent(
    runId: string,
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
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
  private async publishPhaseStart(runId: string, phase: GenerationPhase): Promise<void> {
    await this.publishEvent(runId, "phase_start", { phase });
    this.langfuse.addEvent(runId, "phase_start", { phase });
  }

  /**
   * Publish phase complete event
   */
  private async publishPhaseComplete(
    runId: string,
    phase: GenerationPhase,
    artifact: unknown
  ): Promise<void> {
    await this.publishEvent(runId, "phase_complete", { phase, artifact });
    this.langfuse.addEvent(runId, "phase_complete", { phase });
  }

  /**
   * Save artifact to Supabase
   */
  private async saveArtifact(
    runId: string,
    projectId: string,
    artifactType: string,
    content: unknown
  ): Promise<void> {
    try {
      await this.supabase.saveRunArtifact({
        runId,
        projectId,
        artifactType,
        content,
      });
    } catch (error) {
      console.error(`Failed to save artifact ${artifactType}:`, error);
    }
  }

  /**
   * Handle generation error
   * 
   * IMPORTANT: Publishes ERROR event to Redis Stream so clients don't hang forever
   * Client should check for event.type === "ERROR" and stop waiting
   */
  private async handleError(runId: string, error: unknown): Promise<void> {
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
  private shouldStop(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) {
      $log.info(`[StorytellerOrchestrator] shouldStop: state not found, returning true, runId: ${runId}`);
      return true;
    }
    if (state.isPaused) {
      $log.info(`[StorytellerOrchestrator] shouldStop: isPaused=true, returning true, runId: ${runId}`);
      return true;
    }
    if (state.error) {
      $log.info(`[StorytellerOrchestrator] shouldStop: error=${state.error}, returning true, runId: ${runId}`);
      return true;
    }

    const pauseCallback = this.pauseCallbacks.get(runId);
    if (pauseCallback && pauseCallback()) {
      $log.info(`[StorytellerOrchestrator] shouldStop: pauseCallback returned true, runId: ${runId}`);
      state.isPaused = true;
      return true;
    }

    return false;
  }

  /**
   * Parse JSON from LLM response
   */
  private parseJSON(response: string): Record<string, unknown> {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      return JSON.parse(response);
    } catch (error) {
      console.warn("Failed to parse JSON response:", error);
      return { raw: response };
    }
  }

  /**
   * Parse JSON array from LLM response
   */
  private parseJSONArray(response: string): Record<string, unknown>[] {
    const parsed = this.parseJSON(response);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.characters && Array.isArray(parsed.characters)) {
      return parsed.characters as Record<string, unknown>[];
    }
    return [parsed];
  }

  // ==================== PUBLIC API ====================

  /**
   * Get run status
   */
  getRunStatus(runId: string): RunStatus | null {
    const state = this.activeRuns.get(runId);
    if (!state) return null;

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
  getRunState(runId: string): GenerationState | null {
    return this.activeRuns.get(runId) ?? null;
  }

  /**
   * Pause a run
   */
  pauseRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) return false;

    state.isPaused = true;
    state.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Resume a run
   */
  resumeRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) return false;

    state.isPaused = false;
    state.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Cancel a run
   */
  cancelRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) return false;

    state.error = "Cancelled by user";
    state.updatedAt = new Date().toISOString();
    this.activeRuns.delete(runId);
    return true;
  }

  /**
   * Restore a run from saved state
   */
  restoreRun(state: GenerationState): void {
    this.activeRuns.set(state.runId, state);
  }

  /**
   * List active runs
   */
  listActiveRuns(): RunStatus[] {
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
  async gracefulShutdown(timeoutMs: number = 30000): Promise<number> {
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

      if (allSafe) break;
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
      } catch (error) {
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
  async restoreFromShutdown(runId?: string): Promise<number> {
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
        const artifactData = artifact as { content: Record<string, unknown> };
        const savedState = artifactData.content;
        
        // Deserialize the state (restore Maps from serialized objects)
        const draftsObj = (savedState.drafts as Record<string, Record<string, unknown>>) || {};
        const critiquesObj = (savedState.critiques as Record<string, Record<string, unknown>[]>) || {};
        const revisionObj = (savedState.revisionCount as Record<string, number>) || {};

        const state: GenerationState = {
          ...(savedState as unknown as GenerationState),
          drafts: new Map(
            Object.entries(draftsObj).map(([k, v]) => [parseInt(k, 10), v])
          ),
          critiques: new Map(
            Object.entries(critiquesObj).map(([k, v]) => [parseInt(k, 10), v])
          ),
          revisionCount: new Map(
            Object.entries(revisionObj).map(([k, v]) => [parseInt(k, 10), v])
          ),
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
      } catch (error) {
        console.error(`Orchestrator: Failed to restore run from artifact:`, error);
        return 0;
      }
    } catch (error) {
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
  async restoreAllInterruptedRuns(): Promise<number> {
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
          const savedState = snapshot.content as Record<string, unknown>;
          
          // Check if this run is already active (shouldn't happen, but safety check)
          if (this.activeRuns.has(snapshot.run_id)) {
            console.log(`Orchestrator: Run ${snapshot.run_id} already active, skipping`);
            continue;
          }

          // Deserialize the state (restore Maps from serialized objects)
          const draftsObj = (savedState.drafts as Record<string, Record<string, unknown>>) || {};
          const critiquesObj = (savedState.critiques as Record<string, Record<string, unknown>[]>) || {};
          const revisionObj = (savedState.revisionCount as Record<string, number>) || {};

          const state: GenerationState = {
            ...(savedState as unknown as GenerationState),
            runId: snapshot.run_id,
            projectId: snapshot.project_id,
            drafts: new Map(
              Object.entries(draftsObj).map(([k, v]) => [parseInt(k, 10), v])
            ),
            critiques: new Map(
              Object.entries(critiquesObj).map(([k, v]) => [parseInt(k, 10), v])
            ),
            revisionCount: new Map(
              Object.entries(revisionObj).map(([k, v]) => [parseInt(k, 10), v])
            ),
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
        } catch (error) {
          console.error(`Orchestrator: Failed to restore run ${snapshot.run_id}:`, error);
        }
      }

      console.log(`Orchestrator: Successfully restored ${restoredCount}/${snapshots.length} interrupted runs`);
      return restoredCount;
    } catch (error) {
      console.error("Orchestrator: Error restoring interrupted runs:", error);
      return 0;
    }
  }

  /**
   * Check if shutdown is in progress
   */
  get shuttingDown(): boolean {
    return this.isShuttingDown;
  }
}
