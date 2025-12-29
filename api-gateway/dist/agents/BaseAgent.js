"use strict";
/**
 * Base Agent Class
 *
 * Abstract base class for all agents in the MANOE system.
 * Provides common functionality for LLM calls, JSON parsing, and Langfuse tracing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = void 0;
const LLMModels_1 = require("../models/LLMModels");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
/**
 * Abstract base class for all agents
 */
class BaseAgent {
    agentType;
    llmProvider;
    langfuse;
    contentGuardrail;
    consistencyGuardrail;
    redisStreams;
    constructor(agentType, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        this.agentType = agentType;
        this.llmProvider = llmProvider;
        this.langfuse = langfuse;
        this.contentGuardrail = contentGuardrail;
        this.consistencyGuardrail = consistencyGuardrail;
        this.redisStreams = redisStreams;
    }
    /**
     * Call LLM with retry logic
     */
    async callLLM(runId, systemPrompt, userPrompt, llmConfig, phase) {
        const messages = [
            { role: LLMModels_1.MessageRole.SYSTEM, content: systemPrompt },
            { role: LLMModels_1.MessageRole.USER, content: userPrompt },
        ];
        const spanId = this.langfuse.startSpan(runId, `${this.agentType}_call`, { phase });
        try {
            const response = await this.llmProvider.createCompletionWithRetry({
                messages,
                model: llmConfig.model,
                provider: llmConfig.provider,
                apiKey: llmConfig.apiKey,
                temperature: llmConfig.temperature ?? 0.7,
                maxTokens: (0, LLMModels_1.getMaxTokensForPhase)(phase),
                responseFormat: userPrompt.includes("Output as JSON") || userPrompt.includes("Output JSON")
                    ? { type: "json_object" }
                    : undefined,
            });
            // Track in Langfuse
            this.langfuse.trackLLMCall(runId, this.agentType, messages, response, spanId);
            this.langfuse.endSpan(runId, spanId, { content: response.content.substring(0, 500) });
            return response.content;
        }
        catch (error) {
            this.langfuse.endSpan(runId, spanId, { error: String(error) });
            throw error;
        }
    }
    /**
     * Parse JSON from LLM response
     * Handles markdown code blocks and various JSON formats
     */
    parseJSON(response) {
        try {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1].trim());
            }
            return JSON.parse(response);
        }
        catch (error) {
            console.warn(`[${this.agentType}] Failed to parse JSON response:`, error);
            return { raw: response };
        }
    }
    /**
     * Parse JSON array from LLM response
     * Handles various array formats
     */
    parseJSONArray(response) {
        const parsed = this.parseJSON(response);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed.characters && Array.isArray(parsed.characters)) {
            return parsed.characters;
        }
        return [parsed];
    }
    /**
     * Build constraints block for prompts
     */
    buildConstraintsBlock(constraints) {
        if (constraints.length === 0) {
            return "No constraints established yet.";
        }
        return constraints
            .map((c) => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`)
            .join("\n");
    }
    /**
     * Validate output against Zod schema
     * Logs validation errors to Langfuse and throws ValidationError
     */
    validateOutput(data, schema, runId) {
        const result = schema.safeParse(data);
        if (!result.success) {
            // Log validation error to Langfuse
            this.langfuse.addEvent(runId, "validation_error", {
                agent: this.agentType,
                errors: result.error.errors,
                data: JSON.stringify(data).substring(0, 500), // Truncate for logging
            });
            throw new AgentSchemas_1.ValidationError(result.error, this.agentType);
        }
        return result.data;
    }
    /**
     * Apply guardrails to content
     * Returns array of guardrail results
     */
    async applyGuardrails(content, constraints, runId) {
        const results = [];
        // Apply content guardrail if available
        if (this.contentGuardrail) {
            const contentResult = await this.contentGuardrail.check(content);
            results.push(contentResult);
            if (!contentResult.passed) {
                this.langfuse.addEvent(runId, "guardrail_violation", {
                    agent: this.agentType,
                    type: "content",
                    violations: contentResult.violations,
                    severity: contentResult.severity,
                });
            }
        }
        // Apply consistency guardrail if available
        if (this.consistencyGuardrail && constraints.length > 0) {
            const consistencyResult = await this.consistencyGuardrail.check(content, constraints);
            results.push(consistencyResult);
            if (!consistencyResult.passed) {
                this.langfuse.addEvent(runId, "guardrail_violation", {
                    agent: this.agentType,
                    type: "consistency",
                    violations: consistencyResult.violations,
                    severity: consistencyResult.severity,
                });
            }
        }
        return results;
    }
    /**
     * Emit agent thought event (for Cinematic UI)
     */
    async emitThought(runId, thought, sentiment = "neutral", targetAgent) {
        if (this.redisStreams) {
            console.log(`[${this.agentType}] Emitting thought:`, thought, `runId: ${runId}`);
            try {
                const eventId = await this.redisStreams.publishEvent(runId, "agent_thought", {
                    agent: this.agentType,
                    thought,
                    sentiment,
                    targetAgent,
                });
                console.log(`[${this.agentType}] Published event with ID:`, eventId);
            }
            catch (error) {
                console.error(`[${this.agentType}] Error publishing thought event:`, error);
            }
        }
        else {
            console.warn(`[${this.agentType}] RedisStreams not available, cannot emit thought`);
        }
    }
    /**
     * Emit agent dialogue event (for Cinematic UI)
     */
    async emitDialogue(runId, to, message, dialogueType = "suggestion") {
        if (this.redisStreams) {
            console.log(`[${this.agentType}] Emitting dialogue to ${to}:`, message, `runId: ${runId}`);
            try {
                const eventId = await this.redisStreams.publishEvent(runId, "agent_dialogue", {
                    from: this.agentType,
                    to,
                    message,
                    dialogueType,
                });
                console.log(`[${this.agentType}] Published dialogue event with ID:`, eventId);
            }
            catch (error) {
                console.error(`[${this.agentType}] Error publishing dialogue event:`, error);
            }
        }
        else {
            console.warn(`[${this.agentType}] RedisStreams not available, cannot emit dialogue`);
        }
    }
    /**
     * Emit agent message event with actual generated content
     * This sends the LLM-generated content to the frontend for display in agent cards
     */
    async emitMessage(runId, content, phase) {
        if (this.redisStreams) {
            // Convert content to string if it's an object
            const contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);
            // Truncate for logging but send full content
            const logContent = contentStr.length > 200 ? contentStr.substring(0, 200) + "..." : contentStr;
            console.log(`[${this.agentType}] Emitting message:`, logContent, `runId: ${runId}`);
            try {
                const eventId = await this.redisStreams.publishEvent(runId, "agent_message", {
                    agent: this.agentType,
                    content: contentStr,
                    phase,
                });
                console.log(`[${this.agentType}] Published message event with ID:`, eventId);
            }
            catch (error) {
                console.error(`[${this.agentType}] Error publishing message event:`, error);
            }
        }
        else {
            console.warn(`[${this.agentType}] RedisStreams not available, cannot emit message`);
        }
    }
}
exports.BaseAgent = BaseAgent;
//# sourceMappingURL=BaseAgent.js.map