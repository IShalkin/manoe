"use strict";
/**
 * Architect Agent
 *
 * Designs story structure, themes, and narrative arc.
 * Active in: Genesis, Outlining, Advanced Planning phases
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchitectAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class ArchitectAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.ARCHITECT, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const phase = state.phase;
        // Get system prompt from Langfuse or fallback
        const systemPrompt = await this.getSystemPrompt(context, options);
        // Build user prompt based on phase
        const userPrompt = this.buildUserPrompt(context, options, phase);
        // Emit thought for Cinematic UI
        if (phase === LLMModels_1.GenerationPhase.GENESIS) {
            await this.emitThought(runId, "Analyzing seed idea and designing narrative structure...", "excited");
        }
        else if (phase === LLMModels_1.GenerationPhase.ADVANCED_PLANNING) {
            await this.emitThought(runId, "Creating detailed scene-by-scene plan...", "neutral");
        }
        // Call LLM
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, phase);
        // Parse and validate
        const parsed = this.parseJSON(response);
        if (phase === LLMModels_1.GenerationPhase.GENESIS) {
            const validated = this.validateOutput(parsed, AgentSchemas_1.NarrativeSchema, runId);
            // Emit the actual generated content for the frontend to display
            await this.emitMessage(runId, validated, phase);
            await this.emitThought(runId, "Narrative structure complete. Ready for character development.", "neutral", AgentModels_1.AgentType.PROFILER);
            return { content: validated };
        }
        if (phase === LLMModels_1.GenerationPhase.ADVANCED_PLANNING) {
            const validated = this.validateOutput(parsed, AgentSchemas_1.AdvancedPlanSchema, runId);
            // Emit the actual generated content for the frontend to display
            await this.emitMessage(runId, validated, phase);
            return { content: validated };
        }
        // For OUTLINING, validation is done by StrategistAgent
        // Emit the actual generated content for the frontend to display
        await this.emitMessage(runId, parsed, phase);
        return { content: parsed };
    }
    /**
     * Get system prompt from Langfuse or fallback
     */
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.ARCHITECT;
        const variables = {
            seedIdea: options.seedIdea,
        };
        if (this.langfuse.isEnabled) {
            try {
                const prompt = await this.langfuse.getCompiledPrompt(promptName, variables, { fallback: this.getFallbackPrompt(variables) });
                return prompt;
            }
            catch (error) {
                console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
            }
        }
        return this.compileFallbackPrompt(variables);
    }
    /**
     * Get fallback prompt
     */
    getFallbackPrompt(variables) {
        return `You are the Architect, a master storyteller who designs narrative structures.
Your role is to create compelling story frameworks with clear themes, arcs, and emotional journeys.
${variables.seedIdea ? `Seed idea: ${variables.seedIdea}` : ""}`;
    }
    /**
     * Compile fallback prompt with variables
     */
    compileFallbackPrompt(variables) {
        let prompt = this.getFallbackPrompt(variables);
        for (const [key, value] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
        return prompt;
    }
    /**
     * Build user prompt based on phase
     */
    buildUserPrompt(context, options, phase) {
        if (phase === LLMModels_1.GenerationPhase.GENESIS) {
            return `Create a compelling narrative concept based on this seed idea: "${options.seedIdea}"

Develop:
1. Core premise and hook
2. Central theme and subthemes
3. Narrative arc structure (3-act or 5-act)
4. Tone and atmosphere
5. Target audience and genre positioning

Output as JSON with this EXACT structure:
{
  "premise": "string - the core premise of the story",
  "hook": "string - the compelling hook that draws readers in",
  "themes": ["string array - list of themes like 'redemption', 'love', 'identity'"],
  "arc": "string - narrative arc description like '3-act structure with rising tension'",
  "tone": "string - tone description like 'dark and atmospheric'",
  "audience": "string - target audience like 'young adult readers'",
  "genre": "string - genre like 'science fiction thriller'"
}

IMPORTANT: themes must be an array of strings, arc must be a single string.`;
        }
        if (phase === LLMModels_1.GenerationPhase.OUTLINING) {
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
        if (phase === LLMModels_1.GenerationPhase.ADVANCED_PLANNING) {
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
exports.ArchitectAgent = ArchitectAgent;
//# sourceMappingURL=ArchitectAgent.js.map