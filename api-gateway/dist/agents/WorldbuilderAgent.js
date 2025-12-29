"use strict";
/**
 * Worldbuilder Agent
 *
 * Develops setting, geography, cultures, and world rules.
 * Active in: Worldbuilding phase
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldbuilderAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class WorldbuilderAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.WORLDBUILDER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const systemPrompt = await this.getSystemPrompt(context, options);
        const userPrompt = this.buildUserPrompt(context, options);
        // Emit thought for Cinematic UI
        await this.emitThought(runId, "Building world rules and establishing setting...", "neutral");
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, LLMModels_1.GenerationPhase.WORLDBUILDING);
        const parsed = this.parseJSON(response);
        const validated = this.validateOutput(parsed, AgentSchemas_1.WorldbuildingSchema, runId);
        return { content: validated };
    }
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.WORLDBUILDER;
        const variables = {
            narrative: JSON.stringify(context.state.narrative || {}),
            characters: JSON.stringify(context.state.characters || []),
        };
        if (this.langfuse.isEnabled) {
            try {
                return await this.langfuse.getCompiledPrompt(promptName, variables, { fallback: this.getFallbackPrompt(variables) });
            }
            catch (error) {
                console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
            }
        }
        return this.compileFallbackPrompt(variables);
    }
    getFallbackPrompt(variables) {
        return `You are the Worldbuilder, a creator of immersive settings and worlds.
Your role is to develop rich, consistent worlds that enhance the narrative.
Narrative: ${variables.narrative || "No narrative yet"}
Characters: ${variables.characters || "No characters yet"}`;
    }
    compileFallbackPrompt(variables) {
        let prompt = this.getFallbackPrompt(variables);
        for (const [key, value] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
        return prompt;
    }
    buildUserPrompt(context, options) {
        return `Create a rich, detailed world for the story.

Include:
1. Geography and locations (key settings)
2. Time period and technology level
3. Social structures and power dynamics
4. Cultural elements (customs, beliefs, taboos)
5. Economic systems
6. Magic/technology rules (if applicable)
7. History and lore
8. Sensory details (sights, sounds, smells)

Output as JSON with nested objects for each category.`;
    }
}
exports.WorldbuilderAgent = WorldbuilderAgent;
//# sourceMappingURL=WorldbuilderAgent.js.map