/**
 * Architect Agent
 * 
 * Designs story structure, themes, and narrative arc.
 * Active in: Genesis, Outlining, Advanced Planning phases
 */

import { AgentType, GenerationPhase } from "../models/AgentModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { NarrativeSchema, AdvancedPlanSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class ArchitectAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.ARCHITECT, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;
    const phase = state.phase;

    // Get system prompt from Langfuse or fallback
    const systemPrompt = await this.getSystemPrompt(context, options);

    // Build user prompt based on phase
    const userPrompt = this.buildUserPrompt(context, options, phase);

    // Call LLM
    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      phase
    );

    // Parse and validate
    const parsed = this.parseJSON(response);
    
    if (phase === GenerationPhase.GENESIS) {
      const validated = this.validateOutput(parsed, NarrativeSchema, runId);
      return { content: validated };
    }
    
    if (phase === GenerationPhase.ADVANCED_PLANNING) {
      const validated = this.validateOutput(parsed, AdvancedPlanSchema, runId);
      return { content: validated };
    }

    // For OUTLINING, validation is done by StrategistAgent
    return { content: parsed };
  }

  /**
   * Get system prompt from Langfuse or fallback
   */
  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.ARCHITECT;
    const variables: Record<string, string> = {
      seedIdea: options.seedIdea,
    };

    if (this.langfuse.isEnabled) {
      try {
        const prompt = await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(variables) }
        );
        return prompt;
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(variables);
  }

  /**
   * Get fallback prompt
   */
  private getFallbackPrompt(variables: Record<string, string>): string {
    return `You are the Architect, a master storyteller who designs narrative structures.
Your role is to create compelling story frameworks with clear themes, arcs, and emotional journeys.
${variables.seedIdea ? `Seed idea: ${variables.seedIdea}` : ""}`;
  }

  /**
   * Compile fallback prompt with variables
   */
  private compileFallbackPrompt(variables: Record<string, string>): string {
    let prompt = this.getFallbackPrompt(variables);
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return prompt;
  }

  /**
   * Build user prompt based on phase
   */
  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions,
    phase: GenerationPhase
  ): string {
    if (phase === GenerationPhase.GENESIS) {
      return `Create a compelling narrative concept based on this seed idea: "${options.seedIdea}"

Develop:
1. Core premise and hook
2. Central theme and subthemes
3. Narrative arc structure (3-act or 5-act)
4. Tone and atmosphere
5. Target audience and genre positioning

Output as JSON with fields: premise, hook, themes, arc, tone, audience, genre`;
    }

    if (phase === GenerationPhase.OUTLINING) {
      const narrative = JSON.stringify(context.state.narrative);
      return `Based on the narrative concept, create a detailed scene-by-scene outline.

Narrative: ${narrative}

For each scene include:
1. Scene number and title
2. Setting/location
3. Characters present
4. Scene goal (what must happen)
5. Conflict/tension
6. Emotional beat
7. Key dialogue moments
8. Scene ending hook
9. Word count target

Create 10-20 scenes depending on story complexity.
Output as JSON with "scenes" array.`;
    }

    if (phase === GenerationPhase.ADVANCED_PLANNING) {
      const narrative = JSON.stringify(context.state.narrative);
      const outline = JSON.stringify(context.state.outline);
      return `Create advanced planning elements for the story:

Narrative: ${narrative}
Outline: ${outline}

1. Motif layers - recurring symbols and their meanings
2. Subtext design - what's unsaid but implied
3. Emotional beat sheet - emotional journey per scene
4. Sensory blueprints - key sensory moments
5. Contradiction maps - internal character conflicts
6. Deepening checkpoints - where to add depth
7. Complexity checklists - ensuring narrative richness

Output as JSON with each category as a key.`;
    }

    throw new Error(`ArchitectAgent not configured for phase: ${phase}`);
  }
}

