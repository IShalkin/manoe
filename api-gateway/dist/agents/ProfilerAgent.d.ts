/**
 * Profiler Agent
 *
 * Creates deep character profiles with psychology and arcs.
 * Active in: Characters, Narrator Design phases
 */
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";
export declare class ProfilerAgent extends BaseAgent {
    constructor(llmProvider: LLMProviderService, langfuse: LangfuseService, contentGuardrail?: ContentGuardrail, consistencyGuardrail?: ConsistencyGuardrail, redisStreams?: RedisStreamsService);
    execute(context: AgentContext, options: GenerationOptions): Promise<AgentOutput>;
    private getSystemPrompt;
    private getFallbackPrompt;
    private compileFallbackPrompt;
    private buildUserPrompt;
}
//# sourceMappingURL=ProfilerAgent.d.ts.map