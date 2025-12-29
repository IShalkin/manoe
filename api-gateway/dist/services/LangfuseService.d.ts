/**
 * Langfuse Service for MANOE
 * Provides LLM observability with tracing and Prompt Management
 *
 * Features:
 * - Automatic tracing of all LLM calls
 * - Prompt Management - fetch prompts from Langfuse dashboard
 * - Generation tracking with metadata
 * - Cost tracking and latency monitoring
 * - Span-based tracing for complex workflows
 */
import { LLMProvider, LLMResponse, GenerationPhase } from "../models/LLMModels";
/**
 * Trace metadata
 */
export interface TraceMetadata {
    projectId: string;
    runId: string;
    phase: GenerationPhase;
    agentName?: string;
    userId?: string;
}
/**
 * Generation metadata for tracking
 */
export interface GenerationMetadata {
    traceId: string;
    spanId?: string;
    name: string;
    model: string;
    provider: LLMProvider;
    input: unknown;
    output?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    latencyMs?: number;
    metadata?: Record<string, unknown>;
}
/**
 * Prompt template from Langfuse
 */
export interface PromptTemplate {
    name: string;
    version: number;
    prompt: string;
    config?: Record<string, unknown>;
    labels?: string[];
}
/**
 * Prompt fetch options
 */
export interface PromptFetchOptions {
    version?: number;
    label?: string;
    useCache?: boolean;
}
export declare class LangfuseService {
    private client;
    private activeTraces;
    private promptCache;
    /**
     * Prompt cache TTL in milliseconds (5 minutes)
     * Reduces latency by avoiding API calls on every request
     */
    private readonly PROMPT_CACHE_TTL_MS;
    constructor();
    /**
     * Initialize Langfuse client
     */
    private initialize;
    /**
     * Check if Langfuse is enabled
     */
    get isEnabled(): boolean;
    /**
     * Start a new trace for a generation run
     *
     * @param metadata - Trace metadata including projectId, runId, phase
     * @returns Trace ID
     */
    startTrace(metadata: TraceMetadata): string;
    /**
     * Start a span within a trace (for nested operations)
     *
     * @param runId - The run/trace ID
     * @param spanName - Name of the span
     * @param metadata - Additional metadata
     * @returns Span ID
     */
    startSpan(runId: string, spanName: string, metadata?: Record<string, unknown>): string;
    /**
     * End a span
     *
     * @param runId - The run/trace ID
     * @param spanId - The span ID to end
     * @param output - Output data
     */
    endSpan(runId: string, spanId: string, output?: Record<string, unknown>): void;
    /**
     * Track an LLM generation
     *
     * @param metadata - Generation metadata
     */
    trackGeneration(metadata: GenerationMetadata): void;
    /**
     * Track an LLM response (convenience method)
     *
     * @param runId - The run/trace ID
     * @param agentName - Name of the agent making the call
     * @param input - Input messages/prompt
     * @param response - LLM response
     * @param spanId - Optional parent span ID
     */
    trackLLMCall(runId: string, agentName: string, input: unknown, response: LLMResponse, spanId?: string): void;
    /**
     * End a trace
     *
     * @param runId - The run/trace ID
     * @param output - Final output data
     */
    endTrace(runId: string, output?: Record<string, unknown>): void;
    /**
     * Add an event to a trace
     *
     * @param runId - The run/trace ID
     * @param eventName - Name of the event
     * @param metadata - Event metadata
     */
    addEvent(runId: string, eventName: string, metadata?: Record<string, unknown>): void;
    /**
     * Score a trace (for quality evaluation)
     *
     * @param runId - The run/trace ID
     * @param name - Score name (e.g., "quality", "coherence")
     * @param value - Score value (0-1)
     * @param comment - Optional comment
     */
    scoreTrace(runId: string, name: string, value: number, comment?: string): void;
    /**
     * Default label for production prompts
     * Use versioned prompts with labels for LLMOps best practices
     */
    private readonly DEFAULT_PROMPT_LABEL;
    /**
     * Get a prompt from Langfuse Prompt Management
     *
     * Best Practice: Use labels (e.g., "production") instead of version numbers
     * This allows updating prompts in Langfuse dashboard without code changes
     *
     * @param promptName - Name of the prompt in Langfuse (e.g., "manoe-architect-v1")
     * @param options - Fetch options (version, label, useCache)
     * @returns Prompt template or null if not found
     *
     * @example
     * // Fetch production-tagged prompt (recommended)
     * const prompt = await langfuse.getPrompt("manoe-architect-v1", { label: "production" });
     *
     * // Fetch specific version
     * const prompt = await langfuse.getPrompt("manoe-architect-v1", { version: 3 });
     */
    getPrompt(promptName: string, options?: PromptFetchOptions): Promise<PromptTemplate | null>;
    /**
     * Compile a prompt template with variables
     *
     * @param template - Prompt template string with {{variable}} placeholders
     * @param variables - Variables to substitute
     * @returns Compiled prompt string
     */
    compilePrompt(template: string, variables: Record<string, string>): string;
    /**
     * Get and compile a prompt in one call
     *
     * Best Practice: Always provide a fallback for resilience
     *
     * @param promptName - Name of the prompt in Langfuse
     * @param variables - Variables to substitute
     * @param options - Fetch options and fallback
     * @returns Compiled prompt string
     *
     * @example
     * const prompt = await langfuse.getCompiledPrompt(
     *   "manoe-architect-v1",
     *   { seedIdea: "A story about..." },
     *   { label: "production", fallback: "Default prompt..." }
     * );
     */
    getCompiledPrompt(promptName: string, variables: Record<string, string>, options?: PromptFetchOptions & {
        fallback?: string;
    }): Promise<string>;
    /**
     * Clear prompt cache
     */
    clearPromptCache(): void;
    /**
     * Flush all pending events to Langfuse
     */
    flush(): Promise<void>;
    /**
     * Shutdown Langfuse client
     */
    shutdown(): Promise<void>;
}
/**
 * Agent prompt names in Langfuse
 *
 * Naming convention: {project}-{agent}-v{version}
 * Use "production" label in Langfuse dashboard to mark active prompts
 *
 * LLMOps Best Practice:
 * 1. Create prompt in Langfuse: "manoe-architect-v1"
 * 2. Tag it with "production" label
 * 3. Code fetches by name + label (not version number)
 * 4. To update: create new version, move "production" tag
 */
export declare const AGENT_PROMPTS: {
    readonly ARCHITECT: "manoe-architect-v1";
    readonly PROFILER: "manoe-profiler-v1";
    readonly WORLDBUILDER: "manoe-worldbuilder-v1";
    readonly STRATEGIST: "manoe-strategist-v1";
    readonly WRITER: "manoe-writer-v1";
    readonly CRITIC: "manoe-critic-v1";
    readonly ORIGINALITY: "manoe-originality-v1";
    readonly IMPACT: "manoe-impact-v1";
    readonly ARCHIVIST: "manoe-archivist-v1";
};
/**
 * Phase prompt names in Langfuse
 * Same naming convention as agent prompts
 */
export declare const PHASE_PROMPTS: {
    readonly GENESIS: "manoe-phase-genesis-v1";
    readonly CHARACTERS: "manoe-phase-characters-v1";
    readonly NARRATOR_DESIGN: "manoe-phase-narrator-design-v1";
    readonly WORLDBUILDING: "manoe-phase-worldbuilding-v1";
    readonly OUTLINING: "manoe-phase-outlining-v1";
    readonly ADVANCED_PLANNING: "manoe-phase-advanced-planning-v1";
    readonly DRAFTING: "manoe-phase-drafting-v1";
    readonly CRITIQUE: "manoe-phase-critique-v1";
    readonly REVISION: "manoe-phase-revision-v1";
    readonly ORIGINALITY_CHECK: "manoe-phase-originality-check-v1";
    readonly IMPACT_ASSESSMENT: "manoe-phase-impact-assessment-v1";
    readonly POLISH: "manoe-phase-polish-v1";
};
//# sourceMappingURL=LangfuseService.d.ts.map