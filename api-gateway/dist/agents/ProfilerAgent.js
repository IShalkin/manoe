"use strict";
/**
 * Profiler Agent
 *
 * Creates deep character profiles with psychology and arcs.
 * Active in: Characters, Narrator Design phases
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilerAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class ProfilerAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.PROFILER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const phase = state.phase;
        const systemPrompt = await this.getSystemPrompt(context, options);
        const userPrompt = this.buildUserPrompt(context, options, phase);
        // Emit thought for Cinematic UI
        if (phase === LLMModels_1.GenerationPhase.CHARACTERS) {
            await this.emitThought(runId, "Analyzing character psychology and motivations...", "neutral");
        }
        else if (phase === LLMModels_1.GenerationPhase.NARRATOR_DESIGN) {
            await this.emitThought(runId, "Designing narrative voice and perspective...", "neutral");
        }
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, phase);
        console.log(`[profiler] LLM response received, length: ${response.length}, runId: ${runId}`);
        if (phase === LLMModels_1.GenerationPhase.CHARACTERS) {
            console.log(`[profiler] Parsing JSON array from response, runId: ${runId}`);
            const parsed = this.parseJSONArray(response);
            console.log(`[profiler] Parsed ${Array.isArray(parsed) ? parsed.length : 0} characters, runId: ${runId}`);
            try {
                const validated = this.validateOutput(parsed, AgentSchemas_1.CharactersArraySchema, runId);
                console.log(`[profiler] Validation passed, emitting message, runId: ${runId}`);
                // Emit the actual generated content for the frontend to display
                await this.emitMessage(runId, { characters: validated }, phase);
                console.log(`[profiler] Message emitted, emitting thought, runId: ${runId}`);
                await this.emitThought(runId, "Character profiles complete. Ready for worldbuilding.", "neutral", AgentModels_1.AgentType.WORLDBUILDER);
                console.log(`[profiler] Thought emitted, returning content, runId: ${runId}`);
                return { content: validated };
            }
            catch (validationError) {
                console.error(`[profiler] Validation failed:`, validationError);
                // Skip validation and emit raw content for debugging
                console.log(`[profiler] Emitting raw content without validation, runId: ${runId}`);
                await this.emitMessage(runId, { characters: parsed }, phase);
                await this.emitThought(runId, "Character profiles complete (validation skipped). Ready for worldbuilding.", "neutral", AgentModels_1.AgentType.WORLDBUILDER);
                return { content: parsed };
            }
        }
        // For NARRATOR_DESIGN, return as-is (simple object)
        const content = this.parseJSON(response);
        // Emit the actual generated content for the frontend to display
        await this.emitMessage(runId, content, phase);
        return { content: content };
    }
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.PROFILER;
        const variables = {
            narrative: JSON.stringify(context.state.narrative || {}),
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
        return `You are the Profiler, an expert in character psychology and development.
Your role is to create deep, nuanced characters with authentic motivations and arcs.
Narrative context: ${variables.narrative || "No narrative yet"}`;
    }
    compileFallbackPrompt(variables) {
        let prompt = this.getFallbackPrompt(variables);
        for (const [key, value] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
        return prompt;
    }
    buildUserPrompt(context, options, phase) {
        if (phase === LLMModels_1.GenerationPhase.CHARACTERS) {
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
        if (phase === LLMModels_1.GenerationPhase.NARRATOR_DESIGN) {
            return `Design the narrative voice and perspective for the story.

Output as JSON with fields: voice, perspective, tone, style.`;
        }
        throw new Error(`ProfilerAgent not configured for phase: ${phase}`);
    }
}
exports.ProfilerAgent = ProfilerAgent;
//# sourceMappingURL=ProfilerAgent.js.map