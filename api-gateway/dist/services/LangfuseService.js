"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE_PROMPTS = exports.AGENT_PROMPTS = exports.LangfuseService = void 0;
const di_1 = require("@tsed/di");
const langfuse_1 = require("langfuse");
let LangfuseService = class LangfuseService {
    client = null;
    activeTraces = new Map();
    promptCache = new Map();
    /**
     * Prompt cache TTL in milliseconds (5 minutes)
     * Reduces latency by avoiding API calls on every request
     */
    PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;
    constructor() {
        this.initialize();
    }
    /**
     * Initialize Langfuse client
     */
    initialize() {
        const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
        const secretKey = process.env.LANGFUSE_SECRET_KEY;
        const baseUrl = process.env.LANGFUSE_HOST || "https://langfuse.iliashalkin.com";
        if (!publicKey || !secretKey) {
            console.warn("Langfuse: Missing API keys, tracing disabled");
            return;
        }
        this.client = new langfuse_1.Langfuse({
            publicKey,
            secretKey,
            baseUrl,
        });
        console.log(`Langfuse connected to ${baseUrl}`);
    }
    /**
     * Check if Langfuse is enabled
     */
    get isEnabled() {
        return this.client !== null;
    }
    /**
     * Start a new trace for a generation run
     *
     * @param metadata - Trace metadata including projectId, runId, phase
     * @returns Trace ID
     */
    startTrace(metadata) {
        if (!this.client)
            return metadata.runId;
        const trace = this.client.trace({
            id: metadata.runId,
            name: `MANOE Generation - ${metadata.phase}`,
            metadata: {
                projectId: metadata.projectId,
                phase: metadata.phase,
                agentName: metadata.agentName,
            },
            userId: metadata.userId,
            tags: ["manoe", metadata.phase],
        });
        this.activeTraces.set(metadata.runId, {
            traceId: metadata.runId,
            trace,
            spans: new Map(),
        });
        return metadata.runId;
    }
    /**
     * Start a span within a trace (for nested operations)
     *
     * @param runId - The run/trace ID
     * @param spanName - Name of the span
     * @param metadata - Additional metadata
     * @returns Span ID
     */
    startSpan(runId, spanName, metadata) {
        const context = this.activeTraces.get(runId);
        if (!context)
            return `${runId}-${spanName}`;
        const spanId = `${runId}-${spanName}-${Date.now()}`;
        const span = context.trace.span({
            name: spanName,
            metadata,
        });
        context.spans.set(spanId, span);
        return spanId;
    }
    /**
     * End a span
     *
     * @param runId - The run/trace ID
     * @param spanId - The span ID to end
     * @param output - Output data
     */
    endSpan(runId, spanId, output) {
        const context = this.activeTraces.get(runId);
        if (!context)
            return;
        const span = context.spans.get(spanId);
        if (span) {
            span.end({ output });
            context.spans.delete(spanId);
        }
    }
    /**
     * Track an LLM generation
     *
     * @param metadata - Generation metadata
     */
    trackGeneration(metadata) {
        const context = this.activeTraces.get(metadata.traceId);
        if (!context)
            return;
        const parent = metadata.spanId
            ? context.spans.get(metadata.spanId)
            : context.trace;
        if (!parent)
            return;
        parent.generation({
            name: metadata.name,
            model: metadata.model,
            modelParameters: {
                provider: metadata.provider,
            },
            input: metadata.input,
            output: metadata.output,
            usage: metadata.usage ? {
                promptTokens: metadata.usage.promptTokens,
                completionTokens: metadata.usage.completionTokens,
                totalTokens: metadata.usage.totalTokens,
            } : undefined,
            metadata: {
                ...metadata.metadata,
                latencyMs: metadata.latencyMs,
            },
        });
    }
    /**
     * Track an LLM response (convenience method)
     *
     * @param runId - The run/trace ID
     * @param agentName - Name of the agent making the call
     * @param input - Input messages/prompt
     * @param response - LLM response
     * @param spanId - Optional parent span ID
     */
    trackLLMCall(runId, agentName, input, response, spanId) {
        this.trackGeneration({
            traceId: runId,
            spanId,
            name: `${agentName} - ${response.model}`,
            model: response.model,
            provider: response.provider,
            input,
            output: response.content,
            usage: {
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                totalTokens: response.usage.totalTokens,
            },
            latencyMs: response.latencyMs,
        });
    }
    /**
     * End a trace
     *
     * @param runId - The run/trace ID
     * @param output - Final output data
     */
    endTrace(runId, output) {
        const context = this.activeTraces.get(runId);
        if (!context)
            return;
        // End all remaining spans
        for (const [spanId, span] of context.spans) {
            span.end();
        }
        // Update trace with final output
        context.trace.update({
            output,
        });
        this.activeTraces.delete(runId);
    }
    /**
     * Add an event to a trace
     *
     * @param runId - The run/trace ID
     * @param eventName - Name of the event
     * @param metadata - Event metadata
     */
    addEvent(runId, eventName, metadata) {
        const context = this.activeTraces.get(runId);
        if (!context)
            return;
        context.trace.event({
            name: eventName,
            metadata,
        });
    }
    /**
     * Score a trace (for quality evaluation)
     *
     * @param runId - The run/trace ID
     * @param name - Score name (e.g., "quality", "coherence")
     * @param value - Score value (0-1)
     * @param comment - Optional comment
     */
    scoreTrace(runId, name, value, comment) {
        const context = this.activeTraces.get(runId);
        if (!context)
            return;
        context.trace.score({
            name,
            value,
            comment,
        });
    }
    // ==================== QUALITY METRICS (LLM-as-a-Judge) ====================
    /**
     * Score faithfulness - how well the output matches the plan/intent
     * Used to evaluate if Writer output matches Architect plan
     *
     * @param runId - The run/trace ID
     * @param value - Score value (0-1), where 1 = perfectly faithful
     * @param agentName - Name of the agent being evaluated
     * @param comment - Optional explanation
     */
    scoreFaithfulness(runId, value, agentName, comment) {
        this.scoreTrace(runId, `faithfulness_${agentName}`, value, comment);
        this.addEvent(runId, "quality_score_faithfulness", {
            agentName,
            score: value,
            comment,
        });
    }
    /**
     * Score answer relevance - how well the output matches user's original idea
     * Used to evaluate if character descriptions match user's initial concept
     *
     * @param runId - The run/trace ID
     * @param value - Score value (0-1), where 1 = perfectly relevant
     * @param agentName - Name of the agent being evaluated
     * @param comment - Optional explanation
     */
    scoreRelevance(runId, value, agentName, comment) {
        this.scoreTrace(runId, `relevance_${agentName}`, value, comment);
        this.addEvent(runId, "quality_score_relevance", {
            agentName,
            score: value,
            comment,
        });
    }
    /**
     * Record user feedback (thumbs up/down)
     *
     * @param runId - The run/trace ID
     * @param feedbackType - "thumbs_up" or "thumbs_down"
     * @param agentName - Name of the agent being rated
     * @param sceneNumber - Optional scene number for Writer feedback
     * @param comment - Optional user comment
     */
    recordUserFeedback(runId, feedbackType, agentName, sceneNumber, comment) {
        const value = feedbackType === "thumbs_up" ? 1 : 0;
        this.scoreTrace(runId, `user_feedback_${agentName}`, value, comment);
        this.addEvent(runId, "user_feedback", {
            feedbackType,
            agentName,
            sceneNumber,
            value,
            comment,
        });
    }
    /**
     * Record implicit feedback (regeneration request)
     * Regeneration is a signal of user dissatisfaction
     *
     * @param runId - The run/trace ID
     * @param agentName - Name of the agent being regenerated
     * @param sceneNumber - Optional scene number
     * @param reason - Optional reason for regeneration
     */
    recordRegenerationRequest(runId, agentName, sceneNumber, reason) {
        this.scoreTrace(runId, `regeneration_${agentName}`, 0, reason);
        this.addEvent(runId, "regeneration_request", {
            agentName,
            sceneNumber,
            reason,
            implicitFeedback: "negative",
        });
    }
    // ==================== ERROR OBSERVABILITY ====================
    /**
     * Log Zod validation error to Langfuse
     * Tracks which fields fail validation most often
     *
     * @param runId - The run/trace ID
     * @param agentName - Name of the agent that produced invalid output
     * @param errors - Array of Zod validation errors
     * @param rawOutput - The raw output that failed validation
     */
    logValidationError(runId, agentName, errors, rawOutput) {
        this.addEvent(runId, "validation_error", {
            agentName,
            errorCount: errors.length,
            errors: errors.map(e => ({
                field: e.path,
                message: e.message,
                expected: e.expected,
                received: e.received,
            })),
            rawOutputPreview: rawOutput?.substring(0, 500),
        });
        // Track each field that failed for analytics
        for (const error of errors) {
            this.addEvent(runId, "validation_field_error", {
                agentName,
                field: error.path,
                message: error.message,
            });
        }
    }
    /**
     * Log rate limit error from LLM provider
     *
     * @param runId - The run/trace ID
     * @param provider - LLM provider name
     * @param model - Model name
     * @param retryAfterMs - Suggested retry delay in milliseconds
     */
    logRateLimitError(runId, provider, model, retryAfterMs) {
        this.addEvent(runId, "rate_limit_error", {
            provider,
            model,
            retryAfterMs,
            timestamp: new Date().toISOString(),
        });
    }
    /**
     * Log agent execution result for success rate tracking
     *
     * @param runId - The run/trace ID
     * @param agentName - Name of the agent
     * @param success - Whether the execution was successful
     * @param durationMs - Execution duration in milliseconds
     * @param errorType - Type of error if failed
     * @param errorMessage - Error message if failed
     */
    logAgentExecution(runId, agentName, success, durationMs, errorType, errorMessage) {
        const eventName = success ? "agent_execution_success" : "agent_execution_failure";
        this.addEvent(runId, eventName, {
            agentName,
            success,
            durationMs,
            errorType,
            errorMessage,
        });
        // Score the execution (1 for success, 0 for failure)
        this.scoreTrace(runId, `execution_${agentName}`, success ? 1 : 0, errorMessage);
    }
    /**
     * Log token usage and cost for a generation
     *
     * @param runId - The run/trace ID
     * @param agentName - Name of the agent
     * @param provider - LLM provider
     * @param model - Model name
     * @param promptTokens - Number of prompt tokens
     * @param completionTokens - Number of completion tokens
     * @param costUsd - Cost in USD
     */
    logTokenUsage(runId, agentName, provider, model, promptTokens, completionTokens, costUsd) {
        this.addEvent(runId, "token_usage", {
            agentName,
            provider,
            model,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costUsd,
        });
    }
    // ==================== PROMPT MANAGEMENT ====================
    /**
     * Default label for production prompts
     * Use versioned prompts with labels for LLMOps best practices
     */
    DEFAULT_PROMPT_LABEL = "production";
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
    async getPrompt(promptName, options = {}) {
        if (!this.client) {
            console.warn(`Langfuse: Cannot fetch prompt "${promptName}" - client not initialized`);
            return null;
        }
        const { version, label = this.DEFAULT_PROMPT_LABEL, useCache = true } = options;
        // Build cache key based on version or label
        const cacheKey = version
            ? `${promptName}:v${version}`
            : `${promptName}:${label}`;
        // Check cache first with TTL validation
        if (useCache && this.promptCache.has(cacheKey)) {
            const cached = this.promptCache.get(cacheKey);
            const age = Date.now() - cached.cachedAt;
            if (age < this.PROMPT_CACHE_TTL_MS) {
                // Cache hit - saves 200-500ms latency per request
                return cached.template;
            }
            else {
                // Cache expired - remove stale entry
                this.promptCache.delete(cacheKey);
                console.log(`Langfuse: Cache expired for prompt "${promptName}" (age: ${Math.round(age / 1000)}s)`);
            }
        }
        try {
            // Fetch prompt with version or label
            // If version is specified, use it; otherwise use label
            const prompt = version
                ? await this.client.getPrompt(promptName, version)
                : await this.client.getPrompt(promptName, undefined, { label });
            if (!prompt) {
                console.warn(`Langfuse: Prompt "${promptName}" (${version ? `v${version}` : label}) not found`);
                return null;
            }
            const template = {
                name: promptName,
                version: prompt.version,
                prompt: prompt.prompt,
                config: prompt.config,
                labels: prompt.labels,
            };
            // Cache the prompt with timestamp for TTL
            this.promptCache.set(cacheKey, {
                template,
                cachedAt: Date.now(),
            });
            console.log(`Langfuse: Loaded prompt "${promptName}" v${prompt.version} [${prompt.labels?.join(", ") || "no labels"}] (cached for ${this.PROMPT_CACHE_TTL_MS / 1000}s)`);
            return template;
        }
        catch (error) {
            console.error(`Langfuse: Error fetching prompt "${promptName}":`, error);
            return null;
        }
    }
    /**
     * Compile a prompt template with variables
     *
     * @param template - Prompt template string with {{variable}} placeholders
     * @param variables - Variables to substitute
     * @returns Compiled prompt string
     */
    compilePrompt(template, variables) {
        let compiled = template;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
            compiled = compiled.replace(placeholder, value);
        }
        return compiled;
    }
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
    async getCompiledPrompt(promptName, variables, options = {}) {
        const { fallback, ...fetchOptions } = options;
        const template = await this.getPrompt(promptName, fetchOptions);
        if (!template) {
            if (fallback) {
                console.warn(`Langfuse: Using fallback for prompt "${promptName}"`);
                return this.compilePrompt(fallback, variables);
            }
            throw new Error(`Prompt "${promptName}" not found and no fallback provided`);
        }
        return this.compilePrompt(template.prompt, variables);
    }
    /**
     * Clear prompt cache
     */
    clearPromptCache() {
        this.promptCache.clear();
    }
    /**
     * Flush all pending events to Langfuse
     */
    async flush() {
        if (this.client) {
            await this.client.flushAsync();
        }
    }
    /**
     * Shutdown Langfuse client
     */
    async shutdown() {
        if (this.client) {
            await this.client.shutdownAsync();
            this.client = null;
        }
    }
};
exports.LangfuseService = LangfuseService;
exports.LangfuseService = LangfuseService = __decorate([
    (0, di_1.Service)(),
    __metadata("design:paramtypes", [])
], LangfuseService);
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
exports.AGENT_PROMPTS = {
    ARCHITECT: "manoe-architect-v1",
    PROFILER: "manoe-profiler-v1",
    WORLDBUILDER: "manoe-worldbuilder-v1",
    STRATEGIST: "manoe-strategist-v1",
    WRITER: "manoe-writer-v1",
    CRITIC: "manoe-critic-v1",
    ORIGINALITY: "manoe-originality-v1",
    IMPACT: "manoe-impact-v1",
    ARCHIVIST: "manoe-archivist-v1",
};
/**
 * Phase prompt names in Langfuse
 * Same naming convention as agent prompts
 */
exports.PHASE_PROMPTS = {
    GENESIS: "manoe-phase-genesis-v1",
    CHARACTERS: "manoe-phase-characters-v1",
    NARRATOR_DESIGN: "manoe-phase-narrator-design-v1",
    WORLDBUILDING: "manoe-phase-worldbuilding-v1",
    OUTLINING: "manoe-phase-outlining-v1",
    ADVANCED_PLANNING: "manoe-phase-advanced-planning-v1",
    DRAFTING: "manoe-phase-drafting-v1",
    CRITIQUE: "manoe-phase-critique-v1",
    REVISION: "manoe-phase-revision-v1",
    ORIGINALITY_CHECK: "manoe-phase-originality-check-v1",
    IMPACT_ASSESSMENT: "manoe-phase-impact-assessment-v1",
    POLISH: "manoe-phase-polish-v1",
};
//# sourceMappingURL=LangfuseService.js.map