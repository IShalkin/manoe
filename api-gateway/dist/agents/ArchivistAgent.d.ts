/**
 * Archivist Agent
 *
 * Manages continuity constraints and resolves conflicts.
 * Active in: Drafting, Revision, Polish phases (runs every 3 scenes)
 */
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
}
//# sourceMappingURL=ArchivistAgent.d.ts.map