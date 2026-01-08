/**
 * Archivist Agent
 *
 * Manages continuity constraints and resolves conflicts.
 * Active in: Drafting, Revision, Polish phases (runs every 3 scenes)
 */
import { WorldState } from "../models/AgentModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";
export declare class ArchivistAgent extends BaseAgent {
    constructor(llmProvider: LLMProviderService, langfuse: LangfuseService, contentGuardrail?: ContentGuardrail, consistencyGuardrail?: ConsistencyGuardrail, redisStreams?: RedisStreamsService);
    execute(context: AgentContext, options: GenerationOptions): Promise<AgentOutput>;
    /**
     * Extract key constraints from Archivist validated response
     */
    private extractConstraints;
    private getSystemPrompt;
    private getFallbackPrompt;
    private buildUserPrompt;
    /**
     * Build initial world state from character profiles
     * Called after Characters phase to initialize world state
     */
    buildInitialWorldState(runId: string, characters: Record<string, unknown>[]): WorldState;
    /**
     * Extract character attributes from profile
     */
    private extractAttributes;
    /**
     * Extract character relationships from profile
     */
    private extractRelationships;
    /**
     * Apply world state diff from Archivist output
     */
    applyWorldStateDiff(currentState: WorldState, diff: Record<string, unknown>, sceneNumber: number): WorldState;
}
//# sourceMappingURL=ArchivistAgent.d.ts.map