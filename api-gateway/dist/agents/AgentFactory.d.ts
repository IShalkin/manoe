/**
 * Agent Factory
 *
 * Factory for creating and managing agent instances.
 * Uses dependency injection through Ts.ED and caches agent instances.
 */
import { AgentType } from "../models/AgentModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { RedisStreamsService } from "../services/RedisStreamsService";
import { BaseAgent } from "./BaseAgent";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
export declare class AgentFactory {
    private llmProvider;
    private langfuse;
    private contentGuardrail;
    private consistencyGuardrail;
    private redisStreams;
    private agents;
    constructor(llmProvider: LLMProviderService, langfuse: LangfuseService, contentGuardrail: ContentGuardrail, consistencyGuardrail: ConsistencyGuardrail, redisStreams: RedisStreamsService);
    /**
     * Get agent instance by type
     * Creates and caches agent instances
     */
    getAgent(agentType: AgentType): BaseAgent;
    /**
     * Create agent instance
     */
    private createAgent;
}
//# sourceMappingURL=AgentFactory.d.ts.map