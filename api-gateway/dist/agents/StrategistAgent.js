"use strict";
/**
 * Strategist Agent
 *
 * Plans scene structure, pacing, and narrative beats.
 * Active in: Outlining, Advanced Planning phases
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategistAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class StrategistAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.STRATEGIST, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const phase = state.phase;
        const systemPrompt = await this.getSystemPrompt(context, options);
        const userPrompt = this.buildUserPrompt(context, options, phase);
        // Emit thought for Cinematic UI
        if (phase === LLMModels_1.GenerationPhase.OUTLINING) {
            await this.emitThought(runId, "Creating narrative outline and scene structure...", "neutral");
        }
        else if (phase === LLMModels_1.GenerationPhase.ADVANCED_PLANNING) {
            await this.emitThought(runId, "Developing detailed scene-by-scene strategy...", "neutral");
        }
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, phase);
        const parsed = this.parseJSON(response);
        if (phase === LLMModels_1.GenerationPhase.OUTLINING) {
            // Normalize scenes to ensure required fields exist (handles LLM output variations)
            const parsedObj = parsed;
            if (parsedObj.scenes && Array.isArray(parsedObj.scenes)) {
                parsedObj.scenes = this.normalizeScenes(parsedObj.scenes);
            }
            const validated = this.validateOutput(parsedObj, AgentSchemas_1.OutlineSchema, runId);
            // Emit the actual generated content for the frontend to display
            await this.emitMessage(runId, validated, phase);
            await this.emitThought(runId, "Outline complete. Ready for advanced planning.", "neutral", AgentModels_1.AgentType.ARCHITECT);
            return { content: validated };
        }
        if (phase === LLMModels_1.GenerationPhase.ADVANCED_PLANNING) {
            const validated = this.validateOutput(parsed, AgentSchemas_1.AdvancedPlanSchema, runId);
            // Emit the actual generated content for the frontend to display
            await this.emitMessage(runId, validated, phase);
            await this.emitThought(runId, "Advanced planning complete. Ready for drafting.", "excited", AgentModels_1.AgentType.WRITER);
            return { content: validated };
        }
        // Emit the actual generated content for the frontend to display
        await this.emitMessage(runId, parsed, phase);
        return { content: parsed };
    }
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.STRATEGIST;
        const variables = {
            narrative: JSON.stringify(context.state.narrative || {}),
            characters: JSON.stringify(context.state.characters || []),
            worldbuilding: JSON.stringify(context.state.worldbuilding || {}),
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
        return `You are the Strategist, a master of narrative pacing and scene structure.
Your role is to plan scenes that maximize dramatic impact and reader engagement.
Narrative: ${variables.narrative || "No narrative yet"}
Characters: ${variables.characters || "No characters yet"}
World: ${variables.worldbuilding || "No worldbuilding yet"}`;
    }
    compileFallbackPrompt(variables) {
        let prompt = this.getFallbackPrompt(variables);
        for (const [key, value] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
        return prompt;
    }
    /**
     * Normalize scene data to ensure required fields exist
     * Maps alternative field names to expected schema fields
     */
    normalizeScenes(scenes) {
        return scenes.map((scene, index) => {
            if (typeof scene !== 'object' || scene === null) {
                return { title: `Scene ${index + 1}`, sceneNumber: index + 1 };
            }
            const s = scene;
            // Map alternative title fields to 'title'
            const title = s.title || s.name || s.scene_title || s.heading || s.scene_name ||
                s.sceneName || s.sceneTitle || `Scene ${index + 1}`;
            // Map alternative scene number fields
            const sceneNumber = s.sceneNumber || s.scene_number || s.number || s.sceneNum || index + 1;
            return {
                ...s,
                title: String(title),
                sceneNumber: Number(sceneNumber),
            };
        });
    }
    buildUserPrompt(context, options, phase) {
        if (phase === LLMModels_1.GenerationPhase.OUTLINING) {
            return `Create a detailed scene-by-scene outline for the story.

For each scene include:
1. sceneNumber - Scene number (integer)
2. title - Scene title (string, required)
3. setting - Setting/location
4. characters - Array of character names present
5. goal - Scene goal (what must happen)
6. conflict - Conflict/tension
7. emotionalBeat - Emotional beat
8. dialogue - Key dialogue moments
9. hook - Scene ending hook
10. wordCount - Word count target (integer)

Create 10-20 scenes depending on story complexity.

Output as JSON with "scenes" array. Example format:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "The Discovery",
      "setting": "Ancient library at midnight",
      "characters": ["Elena", "Marcus"],
      "goal": "Elena finds the hidden manuscript",
      "conflict": "Marcus tries to stop her",
      "emotionalBeat": "Tension and curiosity",
      "dialogue": "What are you hiding?",
      "hook": "The manuscript reveals a shocking truth",
      "wordCount": 1500
    }
  ]
}`;
        }
        if (phase === LLMModels_1.GenerationPhase.ADVANCED_PLANNING) {
            return `Create advanced planning elements for the story:

1. Motif layers - recurring symbols and their meanings
2. Subtext design - what's unsaid but implied
3. Emotional beat sheet - emotional journey per scene
4. Sensory blueprints - key sensory moments
5. Contradiction maps - internal character conflicts
6. Deepening checkpoints - where to add depth
7. Complexity checklists - ensuring narrative richness

Output as JSON with each category as a key.`;
        }
        throw new Error(`StrategistAgent not configured for phase: ${phase}`);
    }
}
exports.StrategistAgent = StrategistAgent;
//# sourceMappingURL=StrategistAgent.js.map