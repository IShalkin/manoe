/**
 * Worldbuilder Agent
 * 
 * Develops setting, geography, cultures, and world rules.
 * Active in: Worldbuilding phase
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { WorldbuildingSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class WorldbuilderAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.WORLDBUILDER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;

    const systemPrompt = await this.getSystemPrompt(context, options);
    const userPrompt = this.buildUserPrompt(context, options);

    // Emit thought for Cinematic UI
    await this.emitThought(runId, "Building world rules and establishing setting...", "neutral");

    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      GenerationPhase.WORLDBUILDING
    );

    const parsed = this.parseJSON(response);
    const validated = this.validateOutput(parsed, WorldbuildingSchema, runId);
    
    // Emit the actual generated content for the frontend to display
    await this.emitMessage(runId, validated as Record<string, unknown>, GenerationPhase.WORLDBUILDING);
    await this.emitThought(runId, "World established. Ready for outlining.", "neutral", AgentType.STRATEGIST);
    
    return { content: validated as Record<string, unknown> };
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.WORLDBUILDER;
    const variables: Record<string, string> = {
      narrative: JSON.stringify(context.state.narrative || {}),
      characters: JSON.stringify(context.state.characters || []),
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
    // Parse narrative to extract genre for system prompt emphasis
    let genreInstruction = "";
    try {
      const narrative = JSON.parse(variables.narrative || "{}");
      const genre = this.extractStringValue(narrative?.genre);
      if (genre) {
        genreInstruction = `\n\nCRITICAL GENRE CONSTRAINT: The story genre is "${genre}". You MUST strictly adhere to this genre. DO NOT introduce elements that contradict it (e.g., no fantasy/magic in sci-fi, no sci-fi tech in historical fiction).`;
      }
    } catch {
      // Ignore parse errors
    }
    
    return `You are the Worldbuilder, a creator of immersive settings and worlds.
Your role is to develop rich, consistent worlds that enhance the narrative.
Narrative: ${variables.narrative || "No narrative yet"}
Characters: ${variables.characters || "No characters yet"}${genreInstruction}`;
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
    options: GenerationOptions
  ): string {
    const narrative = context.state.narrative as Record<string, unknown> | undefined;
    const keyConstraints = context.state.keyConstraints || [];
    
    // Extract genre and tone - handle both string and object formats
    const genre = this.extractStringValue(narrative?.genre);
    const tone = this.extractStringValue(narrative?.tone);
    const premise = this.extractStringValue(narrative?.premise);
    
    // Log extracted values for debugging genre adherence issues
    console.log(`[Worldbuilder] Extracted from narrative - Genre: "${genre || 'NOT FOUND'}", Tone: "${tone || 'NOT FOUND'}", Premise: "${premise?.substring(0, 50) || 'NOT FOUND'}..."`);
    
    // Build immutable constraints block from seed constraints (sceneNumber=0)
    const seedConstraints = keyConstraints
      .filter(c => c.sceneNumber === 0 && c.immutable)
      .map(c => `- ${c.key}: ${c.value}`)
      .join("\n");

    return `Create a rich, detailed world for the story.

=== CRITICAL: GENRE AND TONE ADHERENCE ===
You MUST strictly adhere to the genre and tone defined by the Architect.
Genre: ${genre || "Not specified"}
Tone: ${tone || "Not specified"}
Premise: ${premise || "Not specified"}

DO NOT introduce elements that contradict the genre:
- If the genre is "science fiction" or "sci-fi", do NOT add fantasy elements like magic, alchemy, or floating cities
- If the genre is "hard science fiction", focus on realistic technology and scientific plausibility
- If the genre is "thriller" or "psychological thriller", focus on tension, suspense, and realistic settings

${seedConstraints ? `=== IMMUTABLE STORY CONSTRAINTS ===\n${seedConstraints}\n` : ""}
=== WORLDBUILDING REQUIREMENTS ===
Include:
1. Geography and locations (key settings that fit the genre)
2. Time period and technology level (must match the genre)
3. Social structures and power dynamics
4. Cultural elements (customs, beliefs, taboos)
5. Economic systems
6. Technology/science rules (for sci-fi) OR magic rules (ONLY if fantasy genre)
7. History and lore
8. Sensory details (sights, sounds, smells)

Output as JSON with nested objects for each category.`;
  }

  /**
   * Extract string value from a field that might be string or object
   * Handles cases where LLM returns {name: "...", description: "..."} instead of plain string
   */
  private extractStringValue(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      // Try common field names
      if (typeof obj.name === "string") return obj.name;
      if (typeof obj.theme === "string") return obj.theme;
      if (typeof obj.description === "string") return obj.description;
      if (typeof obj.type === "string") return obj.type;
      // Fallback to JSON stringification for complex objects
      return JSON.stringify(value);
    }
    return "";
  }
}

