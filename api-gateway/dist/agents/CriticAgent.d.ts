/**
 * Critic Agent
 *
 * Evaluates prose quality and provides revision feedback.
 * Active in: Critique, Revision phases
 */
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";
export declare class CriticAgent extends BaseAgent {
    constructor(llmProvider: LLMProviderService, langfuse: LangfuseService, contentGuardrail?: ContentGuardrail, consistencyGuardrail?: ConsistencyGuardrail, redisStreams?: RedisStreamsService);
    execute(context: AgentContext, options: GenerationOptions): Promise<AgentOutput>;
    /**
     * Determine if revision is needed based on critique
     * Uses Guard Clause Pattern: check failure conditions first, then success conditions
     * This prevents bugs where high scores could bypass issue checks
     */
    private isRevisionNeeded;
    /**
     * Get system prompt from Langfuse or fallback
     */
    private getSystemPrompt;
    /**
     * Get fallback prompt
     */
    private getFallbackPrompt;
    /**
     * Compile fallback prompt with variables
     */
    private compileFallbackPrompt;
    /**
     * Build user prompt based on phase
     */
    private buildUserPrompt;
}
//# sourceMappingURL=CriticAgent.d.ts.map