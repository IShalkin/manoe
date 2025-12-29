"use strict";
/**
 * Writer Agent
 *
 * Generates prose for scenes with voice and style.
 * Active in: Drafting, Revision, Polish phases
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WriterAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
class WriterAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.WRITER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const phase = state.phase;
        // Get system prompt from Langfuse or fallback
        const systemPrompt = await this.getSystemPrompt(context, options);
        // Build user prompt based on phase
        const userPrompt = this.buildUserPrompt(context, options, phase);
        // Emit thought for Cinematic UI
        if (phase === LLMModels_1.GenerationPhase.DRAFTING) {
            await this.emitThought(runId, "Analyzing scene structure and character motivations...", "neutral");
        }
        else if (phase === LLMModels_1.GenerationPhase.REVISION) {
            await this.emitThought(runId, "Revising based on critique feedback...", "neutral", AgentModels_1.AgentType.CRITIC);
        }
        // Call LLM
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, phase);
        // Apply guardrails for prose content
        if (phase === LLMModels_1.GenerationPhase.DRAFTING ||
            phase === LLMModels_1.GenerationPhase.REVISION ||
            phase === LLMModels_1.GenerationPhase.POLISH) {
            // Apply guardrails
            await this.applyGuardrails(response, state.keyConstraints, runId);
            // Emit completion thought
            if (phase === LLMModels_1.GenerationPhase.DRAFTING) {
                await this.emitThought(runId, "Draft complete. Awaiting Critic's feedback.", "neutral", AgentModels_1.AgentType.CRITIC);
            }
            return { content: response };
        }
        // For other phases, parse as JSON
        const content = this.parseJSON(response);
        return { content: content };
    }
    /**
     * Get system prompt from Langfuse or fallback
     */
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.WRITER;
        const constraintsBlock = this.buildConstraintsBlock(context.state.keyConstraints);
        const variables = {
            narrative: JSON.stringify(context.state.narrative || {}),
            characters: JSON.stringify(context.state.characters || []),
            keyConstraints: constraintsBlock,
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
        return `You are the Writer, a skilled prose craftsman.
Your role is to transform outlines into vivid, engaging prose that brings the story to life.
Maintain consistency with established facts.
Key Constraints: ${variables.keyConstraints || "No constraints established yet."}`;
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
        const state = context.state;
        const constraintsBlock = this.buildConstraintsBlock(state.keyConstraints);
        if (phase === LLMModels_1.GenerationPhase.DRAFTING) {
            // This will be called from Orchestrator with scene-specific data
            // For now, return a generic prompt structure
            // Orchestrator will pass scene details via metadata
            const sceneNum = state.currentScene;
            const outline = state.outline;
            const scenes = outline?.scenes || [];
            const sceneOutline = scenes[sceneNum - 1] || {};
            const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);
            return `Write Scene ${sceneNum}: "${sceneTitle}"

Scene outline:
${JSON.stringify(sceneOutline, null, 2)}

Requirements:
- Follow the emotional beat and conflict specified
- Maintain character voices and consistency
- Include sensory details and atmosphere
- End with the specified hook
- Target word count: ${sceneOutline.wordCount ?? 1500} words

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}

Write the full scene prose.`;
        }
        if (phase === LLMModels_1.GenerationPhase.REVISION) {
            // This will be called from Orchestrator with critique feedback
            const sceneNum = state.currentScene;
            const draft = state.drafts.get(sceneNum);
            const critiques = state.critiques.get(sceneNum) || [];
            const latestCritique = critiques[critiques.length - 1] || {};
            if (!draft) {
                throw new Error(`No draft found for scene ${sceneNum}`);
            }
            return `Revise Scene ${sceneNum} based on critique feedback.

Original draft:
${draft.content}

Critique feedback:
Issues: ${JSON.stringify(latestCritique.issues || [])}
Revision requests: ${JSON.stringify(latestCritique.revisionRequests || [])}

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}

Write the revised scene, addressing all feedback while maintaining what works.`;
        }
        if (phase === LLMModels_1.GenerationPhase.POLISH) {
            const sceneNum = state.currentScene;
            const draft = state.drafts.get(sceneNum);
            if (!draft) {
                throw new Error(`No draft found for scene ${sceneNum}`);
            }
            return `Polish Scene ${sceneNum} for final publication quality.

Current draft:
${draft.content}

Polish for:
- Sentence flow and rhythm
- Word choice precision
- Consistency in voice
- Final proofreading

Output the polished scene prose.`;
        }
        throw new Error(`WriterAgent not configured for phase: ${phase}`);
    }
}
exports.WriterAgent = WriterAgent;
//# sourceMappingURL=WriterAgent.js.map