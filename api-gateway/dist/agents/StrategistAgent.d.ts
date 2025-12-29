/**
 * Strategist Agent
 *
 * Plans scene structure, pacing, and narrative beats.
 * Active in: Outlining, Advanced Planning phases
 */
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";
export declare class StrategistAgent extends BaseAgent {
    constructor(llmProvider: LLMProviderService, langfuse: LangfuseService, contentGuardrail?: ContentGuardrail, consistencyGuardrail?: ConsistencyGuardrail, redisStreams?: RedisStreamsService);
    execute(context: AgentContext, options: GenerationOptions): Promise<AgentOutput>;
    private getSystemPrompt;
    private getFallbackPrompt;
    private compileFallbackPrompt;
    private buildUserPrompt;
}
//# sourceMappingURL=StrategistAgent.d.ts.map