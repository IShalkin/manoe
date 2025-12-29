/**
 * Writer Agent
 *
 * Generates prose for scenes with voice and style.
 * Active in: Drafting, Revision, Polish phases
 */
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";
export declare class WriterAgent extends BaseAgent {
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
//# sourceMappingURL=WriterAgent.d.ts.map