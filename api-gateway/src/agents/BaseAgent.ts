/**
 * Base Agent Class
 * 
 * Abstract base class for all agents in the MANOE system.
 * Provides common functionality for LLM calls, JSON parsing, and Langfuse tracing.
 */

import { AgentType, GenerationState, MessageType, KeyConstraint } from "../models/AgentModels";
import { GenerationPhase, ChatMessage, MessageRole, getMaxTokensForPhase, LLMProvider } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { RedisStreamsService } from "../services/RedisStreamsService";
import { AgentContext, AgentOutput, GenerationOptions, LLMConfiguration } from "./types";
import { z } from "zod";
import { ValidationError } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail, GuardrailResult } from "../guardrails";

/**
 * Abstract base class for all agents
 */
export abstract class BaseAgent {
  protected redisStreams?: RedisStreamsService;

  constructor(
    protected agentType: AgentType,
    protected llmProvider: LLMProviderService,
    protected langfuse: LangfuseService,
    protected contentGuardrail?: ContentGuardrail,
    protected consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    this.redisStreams = redisStreams;
  }

  /**
   * Call LLM with retry logic
   */
  protected async callLLM(
    runId: string,
    systemPrompt: string,
    userPrompt: string,
    llmConfig: LLMConfiguration,
    phase: GenerationPhase
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: MessageRole.SYSTEM, content: systemPrompt },
      { role: MessageRole.USER, content: userPrompt },
    ];

    const spanId = this.langfuse.startSpan(runId, `${this.agentType}_call`, { phase });

    const expectsArray =
      userPrompt.includes("Output as JSON array") ||
      userPrompt.includes("Output JSON array") ||
      userPrompt.includes("Return a JSON array");
    const expectsObject =
      (userPrompt.includes("Output as JSON") || userPrompt.includes("Output JSON")) &&
      !expectsArray;

    try {
      const response = await this.llmProvider.createCompletionWithRetry({
        messages,
        model: llmConfig.model,
        provider: llmConfig.provider as LLMProvider,
        apiKey: llmConfig.apiKey,
        temperature: llmConfig.temperature ?? 0.7,
        maxTokens: getMaxTokensForPhase(phase),
        responseFormat: expectsObject ? { type: "json_object" } : undefined,
        runId,
        agentName: this.agentType,
      });

      // Track in Langfuse
      this.langfuse.trackLLMCall(runId, this.agentType, messages, response, spanId);
      this.langfuse.endSpan(runId, spanId, { content: response.content.substring(0, 500) });

      return response.content;
    } catch (error) {
      this.langfuse.endSpan(runId, spanId, { error: String(error) });
      throw error;
    }
  }

  /**
   * Extract the JSON payload from an LLM response.
   *
   * Pure, dependency-free helper so the parse logic is unit-testable in
   * isolation. Returns the raw JSON *string* to parse, or null if nothing
   * parseable was found.
   *
   * Fence selection: LLMs sometimes emit an explanatory ```json example```
   * BEFORE the real answer in a second fence. The previous non-greedy regex
   * matched the FIRST fence and parsed the example. We instead collect ALL
   * fenced blocks and return the LAST one that JSON.parses successfully
   * (the answer almost always comes after any example). If no fenced block
   * parses, we fall back to the whole response string (also validated by a
   * trial JSON.parse). If nothing parses, return null.
   *
   * Heuristic limitation: LAST-block selection has a known inverse failure —
   * if the model emits its real ANSWER first and an illustrative EXAMPLE fence
   * afterward, we return the example. This trade-off favors the far more common
   * example-first/answer-last ordering. (Pinned by a test in
   * BaseAgentParseJSON.test.ts so future changes are intentional.)
   */
  protected static extractJSON(response: string): string | null {
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
    const candidates: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(response)) !== null) {
      candidates.push(match[1].trim());
    }

    // Prefer the LAST fenced block that parses to valid JSON.
    for (let i = candidates.length - 1; i >= 0; i--) {
      try {
        JSON.parse(candidates[i]);
        return candidates[i];
      } catch {
        // try the next candidate
      }
    }

    // No (parseable) fence — fall back to the whole string if it is JSON.
    const trimmed = response.trim();
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }

  /**
   * Parse JSON from LLM response
   * Handles markdown code blocks and various JSON formats.
   *
   * Total by contract (never throws) — callers pass the result straight to
   * Zod validation. On parse failure we return a sentinel that is BOTH
   * - detectable downstream (`__parseError: true`), so a parse failure is no
   *   longer mistaken for "required field missing" by Zod, AND
   * - backward compatible (`raw: response` is preserved) so any caller that
   *   inspected `.raw` still works.
   */
  protected parseJSON(response: string): Record<string, unknown> {
    const json = BaseAgent.extractJSON(response);
    if (json !== null) {
      try {
        return JSON.parse(json);
      } catch (error) {
        // extractJSON already validated parseability; reaching here means the
        // payload changed shape unexpectedly. Fall through to the sentinel.
        console.warn(`[${this.agentType}] Failed to parse extracted JSON:`, error);
      }
    } else {
      console.warn(
        `[${this.agentType}] Failed to parse JSON response (no parseable JSON found)`
      );
    }
    return { __parseError: true, raw: response };
  }

  /**
   * Parse JSON array from LLM response
   * Handles various array formats
   */
  protected parseJSONArray(response: string): Record<string, unknown>[] {
    const parsed = this.parseJSON(response);
    // Propagate parseJSON's failure contract: on a parse failure `parsed` is the
    // sentinel `{ __parseError: true, raw }`. Wrapping it as `[parsed]` would
    // leak a fake "character" object downstream (ProfilerAgent's catch path
    // emits it to the frontend). Return [] instead — the sole caller validates
    // against CharactersArraySchema (.min(1)), so an empty array still fails
    // validation cleanly (no silent "0 characters = success"), while nothing
    // malformed escapes.
    if (parsed.__parseError === true) {
      return [];
    }
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.characters && Array.isArray(parsed.characters)) {
      return parsed.characters as Record<string, unknown>[];
    }
    return [parsed];
  }

  /**
   * Build constraints block for prompts
   */
  protected buildConstraintsBlock(constraints: { key: string; value: string; sceneNumber: number }[]): string {
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
  protected validateOutput<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    runId: string
  ): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      this.langfuse.addEvent(runId, "validation_error", {
        agent: this.agentType,
        errors: result.error.errors,
        data: JSON.stringify(data).substring(0, 500),
      });
      throw new ValidationError(result.error, this.agentType);
    }
    return result.data;
  }

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
  protected async validateWithRepair<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    runId: string,
    llmConfig: LLMConfiguration,
    repairHint?: string
  ): Promise<T> {
    const result = schema.safeParse(data);
    if (result.success) {
      return result.data;
    }

    console.warn(`[${this.agentType}] Validation failed, attempting repair`);
    this.langfuse.addEvent(runId, "validation_repair_attempt", {
      agent: this.agentType,
      errors: result.error.errors,
    });

    const repairSystemPrompt = `You are a JSON repair assistant. Your task is to fix the provided JSON data to match the required schema. Only output valid JSON, no explanations.`;

    const repairUserPrompt = `The following JSON data failed validation:

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

Validation errors:
${JSON.stringify(result.error.errors, null, 2)}

${repairHint ? `Hint: ${repairHint}` : ""}

Please fix the JSON to resolve these validation errors. Output only the corrected JSON.`;

    try {
      const repairResponse = await this.callLLM(
        runId,
        repairSystemPrompt,
        repairUserPrompt,
        llmConfig,
        GenerationPhase.GENESIS
      );

      const repairedData = this.parseJSON(repairResponse);
      return this.validateOutput(repairedData, schema, runId);
    } catch (repairError) {
      console.error(`[${this.agentType}] Repair attempt failed:`, repairError);
      this.langfuse.addEvent(runId, "validation_repair_failed", {
        agent: this.agentType,
        originalErrors: result.error.errors,
        repairError: String(repairError),
      });
      throw new ValidationError(result.error, this.agentType);
    }
  }

  /**
   * Apply guardrails to content
   * Returns array of guardrail results
   */
  protected async applyGuardrails(
    content: string,
    constraints: KeyConstraint[],
    runId: string
  ): Promise<GuardrailResult[]> {
    const results: GuardrailResult[] = [];

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
  protected async emitThought(
    runId: string,
    thought: string,
    sentiment: "neutral" | "agree" | "disagree" | "excited" | "concerned" = "neutral",
    targetAgent?: AgentType
  ): Promise<void> {
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
      } catch (error) {
        console.error(`[${this.agentType}] Error publishing thought event:`, error);
      }
    } else {
      console.warn(`[${this.agentType}] RedisStreams not available, cannot emit thought`);
    }
  }

  /**
   * Emit agent dialogue event (for Cinematic UI)
   */
  protected async emitDialogue(
    runId: string,
    to: AgentType,
    message: string,
    dialogueType: "question" | "objection" | "approval" | "suggestion" = "suggestion"
  ): Promise<void> {
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
      } catch (error) {
        console.error(`[${this.agentType}] Error publishing dialogue event:`, error);
      }
    } else {
      console.warn(`[${this.agentType}] RedisStreams not available, cannot emit dialogue`);
    }
  }

  /**
   * Emit agent message event with actual generated content
   * This sends the LLM-generated content to the frontend for display in agent cards
   * 
   * @param runId - Run ID for the generation
   * @param content - Content to emit (string or object with sceneNumber)
   * @param phase - Current generation phase
   * @param sceneNum - Optional scene number for scene-based deduplication on frontend
   */
  protected async emitMessage(
    runId: string,
    content: string | Record<string, unknown>,
    phase: GenerationPhase,
    sceneNum?: number
  ): Promise<void> {
    if (this.redisStreams) {
      // Convert content to string if it's an object
      const contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);
      // Truncate for logging but send full content
      const logContent = contentStr.length > 200 ? contentStr.substring(0, 200) + "..." : contentStr;
      console.log(`[${this.agentType}] Emitting message:`, logContent, `runId: ${runId}, sceneNum: ${sceneNum}`);
      try {
        const eventId = await this.redisStreams.publishEvent(runId, "agent_message", {
          agent: this.agentType,
          content: contentStr,
          phase,
          sceneNum,  // Include sceneNum for frontend deduplication
        });
        console.log(`[${this.agentType}] Published message event with ID:`, eventId);
      } catch (error) {
        console.error(`[${this.agentType}] Error publishing message event:`, error);
      }
    } else {
      console.warn(`[${this.agentType}] RedisStreams not available, cannot emit message`);
    }
  }

  /**
   * Abstract method to be implemented by each agent
   */
  abstract execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput>;
}

