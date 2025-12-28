/**
 * Profiler Agent
 * 
 * Creates deep character profiles with psychology and arcs.
 * Active in: Characters, Narrator Design phases
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { CharactersArraySchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

type CharacterRole = "protagonist" | "antagonist" | "supporting";

export class ProfilerAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.PROFILER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;
    const phase = state.phase;

    const systemPrompt = await this.getSystemPrompt(context, options);
    const userPrompt = this.buildUserPrompt(context, options, phase);

    // Emit thought for Cinematic UI
    if (phase === GenerationPhase.CHARACTERS) {
      await this.emitThought(runId, "Analyzing character psychology and motivations...", "neutral");
    } else if (phase === GenerationPhase.NARRATOR_DESIGN) {
      await this.emitThought(runId, "Designing narrative voice and perspective...", "neutral");
    }

    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      phase
    );

    if (phase === GenerationPhase.CHARACTERS) {
      const parsed = this.parseJSONArray(response);
      const normalized = this.normalizeCharacters(parsed);
      const validated = this.validateOutput(normalized, CharactersArraySchema, runId);
      return { content: validated as Record<string, unknown>[] };
    }

    // For NARRATOR_DESIGN, return as-is (simple object)
    const content = this.parseJSON(response);
    return { content: content as Record<string, unknown> };
  }

  /**
   * Normalize character data from LLM output
   * Extracts the role type from descriptive strings like "Protagonist — description"
   * Also handles field name variations from LLM output
   */
  private normalizeCharacters(characters: Record<string, unknown>[]): Record<string, unknown>[] {
    return characters.map((char) => ({
      ...char,
      role: this.normalizeRole(char.role),
      // Handle motivation field variations - LLM might use different field names
      motivation: this.extractMotivation(char),
    }));
  }

  /**
   * Extract motivation from character data, handling various field name variations
   */
  private extractMotivation(char: Record<string, unknown>): string {
    // Direct motivation field
    if (typeof char.motivation === "string" && char.motivation.length > 0) {
      return char.motivation;
    }

    // Common variations
    const motivationFields = [
      "core_motivation",
      "coreMotivation",
      "desire",
      "goal",
      "objective",
      "drive",
    ];

    for (const field of motivationFields) {
      if (typeof char[field] === "string" && (char[field] as string).length > 0) {
        return char[field] as string;
      }
    }

    // Check nested psychology object
    if (char.psychology && typeof char.psychology === "object") {
      const psych = char.psychology as Record<string, unknown>;
      if (typeof psych.motivation === "string" && psych.motivation.length > 0) {
        return psych.motivation;
      }
      if (typeof psych.desire === "string" && psych.desire.length > 0) {
        return psych.desire;
      }
    }

    // Fallback - generate from role if available
    const role = this.normalizeRole(char.role);
    return `Character with ${role} role`;
  }

  /**
   * Extract the role type from a potentially descriptive role string
   * Handles formats like:
   * - "protagonist" -> "protagonist"
   * - "Protagonist" -> "protagonist"
   * - "Protagonist — description" -> "protagonist"
   * - "Supporting/Shadow-Antagonist — description" -> "supporting"
   * - "shadow-antagonist" -> "supporting" (shadow antagonists are supporting characters)
   */
  private normalizeRole(role: unknown): CharacterRole {
    if (typeof role !== "string") {
      return "supporting"; // Default fallback
    }

    const roleLower = role.toLowerCase();

    // Check for protagonist
    if (roleLower.startsWith("protagonist")) {
      return "protagonist";
    }

    // Check for shadow-antagonist BEFORE checking for antagonist
    // Shadow antagonists are supporting characters, not main antagonists
    if (roleLower.includes("shadow-antagonist") || roleLower.includes("shadow antagonist")) {
      return "supporting";
    }

    // Check for antagonist (main antagonist only)
    if (roleLower.startsWith("antagonist")) {
      return "antagonist";
    }

    // Check for supporting or any other role
    if (roleLower.startsWith("supporting") || roleLower.includes("supporting")) {
      return "supporting";
    }

    // Check if antagonist appears anywhere (for main antagonist variations)
    if (roleLower.includes("antagonist")) {
      return "antagonist";
    }

    // Default to supporting for any unrecognized role
    return "supporting";
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.PROFILER;
    const variables: Record<string, string> = {
      narrative: JSON.stringify(context.state.narrative || {}),
    };

    if (this.langfuse.isEnabled) {
      try {
        return await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(variables) }
        );
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(variables);
  }

  private getFallbackPrompt(variables: Record<string, string>): string {
    return `You are the Profiler, an expert in character psychology and development.
Your role is to create deep, nuanced characters with authentic motivations and arcs.
Narrative context: ${variables.narrative || "No narrative yet"}`;
  }

  private compileFallbackPrompt(variables: Record<string, string>): string {
    let prompt = this.getFallbackPrompt(variables);
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return prompt;
  }

  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions,
    phase: GenerationPhase
  ): string {
    if (phase === GenerationPhase.CHARACTERS) {
      return `Based on the narrative concept, create detailed character profiles.

For each character include:
1. Name and role (protagonist, antagonist, supporting)
2. Archetype and subversion
3. Core motivation and desire
4. Psychological wound and inner trap
5. Character arc trajectory
6. Backstory highlights
7. Visual signature and mannerisms
8. Voice and speech patterns
9. Relationships to other characters

Create at least 3-5 main characters.
Output as JSON array with character objects.`;
    }

    if (phase === GenerationPhase.NARRATOR_DESIGN) {
      return `Design the narrative voice and perspective for the story.

Output as JSON with fields: voice, perspective, tone, style.`;
    }

    throw new Error(`ProfilerAgent not configured for phase: ${phase}`);
  }
}

