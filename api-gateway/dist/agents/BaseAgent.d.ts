/**
 * Base Agent Class
 *
 * Abstract base class for all agents in the MANOE system.
 * Provides common functionality for LLM calls, JSON parsing, and Langfuse tracing.
 */
import { AgentType, KeyConstraint } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { RedisStreamsService } from "../services/RedisStreamsService";
import { AgentContext, AgentOutput, GenerationOptions, LLMConfiguration } from "./types";
import { z } from "zod";
import { ContentGuardrail, ConsistencyGuardrail, GuardrailResult } from "../guardrails";
/**
 * Abstract base class for all agents
 */
export declare abstract class BaseAgent {
    protected agentType: AgentType;
    protected llmProvider: LLMProviderService;
    protected langfuse: LangfuseService;
    protected contentGuardrail?: ContentGuardrail | undefined;
    protected consistencyGuardrail?: ConsistencyGuardrail | undefined;
    protected redisStreams?: RedisStreamsService;
    constructor(agentType: AgentType, llmProvider: LLMProviderService, langfuse: LangfuseService, contentGuardrail?: ContentGuardrail | undefined, consistencyGuardrail?: ConsistencyGuardrail | undefined, redisStreams?: RedisStreamsService);
    /**
     * Call LLM with retry logic
     */
    protected callLLM(runId: string, systemPrompt: string, userPrompt: string, llmConfig: LLMConfiguration, phase: GenerationPhase): Promise<string>;
    /**
     * Parse JSON from LLM response
     * Handles markdown code blocks and various JSON formats
     */
    protected parseJSON(response: string): Record<string, unknown>;
    /**
     * Parse JSON array from LLM response
     * Handles various array formats
     */
    protected parseJSONArray(response: string): Record<string, unknown>[];
    /**
     * Build constraints block for prompts
     */
    protected buildConstraintsBlock(constraints: {
        key: string;
        value: string;
        sceneNumber: number;
    }[]): string;
    /**
     * Validate output against Zod schema
     * Logs validation errors to Langfuse and throws ValidationError
     */
    protected validateOutput<T>(data: unknown, schema: z.ZodSchema<T>, runId: string): T;
    /**
     * Validate output with repair retry for persistent failures
     * If initial validation fails, attempts to repair the JSON using LLM
     *
     * @param data - Data to validate
     * @param schema - Zod schema to validate against
     * @param runId - Run ID for tracing
     * @param llmConfig - LLM configuration for repair call
     * @param repairHint - Optional hint for the repair prompt
     * @returns Validated data
     */
    protected validateWithRepair<T>(data: unknown, schema: z.ZodSchema<T>, runId: string, llmConfig: LLMConfiguration, repairHint?: string): Promise<T>;
    /**
     * Apply guardrails to content
     * Returns array of guardrail results
     */
    protected applyGuardrails(content: string, constraints: KeyConstraint[], runId: string): Promise<GuardrailResult[]>;
    /**
     * Emit agent thought event (for Cinematic UI)
     */
    protected emitThought(runId: string, thought: string, sentiment?: "neutral" | "agree" | "disagree" | "excited" | "concerned", targetAgent?: AgentType): Promise<void>;
    /**
     * Emit agent dialogue event (for Cinematic UI)
     */
    protected emitDialogue(runId: string, to: AgentType, message: string, dialogueType?: "question" | "objection" | "approval" | "suggestion"): Promise<void>;
    /**
     * Emit agent message event with actual generated content
     * This sends the LLM-generated content to the frontend for display in agent cards
     *
     * @param runId - Run ID for the generation
     * @param content - Content to emit (string or object with sceneNumber)
     * @param phase - Current generation phase
     * @param sceneNum - Optional scene number for scene-based deduplication on frontend
     */
    protected emitMessage(runId: string, content: string | Record<string, unknown>, phase: GenerationPhase, sceneNum?: number): Promise<void>;
    /**
     * Abstract method to be implemented by each agent
     */
    abstract execute(context: AgentContext, options: GenerationOptions): Promise<AgentOutput>;
}
//# sourceMappingURL=BaseAgent.d.ts.map