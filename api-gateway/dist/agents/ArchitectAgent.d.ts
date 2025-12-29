/**
 * Architect Agent
 *
 * Designs story structure, themes, and narrative arc.
 * Active in: Genesis, Outlining, Advanced Planning phases
 */
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";
export declare class ArchitectAgent extends BaseAgent {
    constructor(llmProvider: LLMProviderService, langfuse: LangfuseService, contentGuardrail?: ContentGuardrail, consistencyGuardrail?: ConsistencyGuardrail, redisStreams?: RedisStreamsService);
    execute(context: AgentContext, options: GenerationOptions): Promise<AgentOutput>;
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
//# sourceMappingURL=ArchitectAgent.d.ts.map