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
            // Emit the actual generated content for the frontend to display
            await this.emitMessage(runId, { content: response, sceneNumber: state.currentScene }, phase);
            // Emit completion thought
            if (phase === LLMModels_1.GenerationPhase.DRAFTING) {
                await this.emitThought(runId, "Draft complete. Awaiting Critic's feedback.", "neutral", AgentModels_1.AgentType.CRITIC);
            }
            else if (phase === LLMModels_1.GenerationPhase.REVISION) {
                await this.emitThought(runId, "Revision complete. Ready for re-evaluation.", "neutral", AgentModels_1.AgentType.CRITIC);
            }
            else if (phase === LLMModels_1.GenerationPhase.POLISH) {
                await this.emitThought(runId, "Polish complete. Scene finalized.", "excited");
            }
            return { content: response };
        }
        // For other phases, parse as JSON
        const content = this.parseJSON(response);
        // Emit the actual generated content for the frontend to display
        await this.emitMessage(runId, content, phase);
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
     * CRITICAL: Includes autonomous agent instruction to prevent persona break
     */
    getFallbackPrompt(variables) {
        return `You are the Writer, a skilled prose craftsman in an autonomous story generation pipeline.
Your role is to transform outlines into vivid, engaging prose that brings the story to life.
Maintain consistency with established facts.

CRITICAL INSTRUCTION: You are an autonomous agent in a simulation. DO NOT ask the user for feedback. DO NOT offer options (A/B/C). Always execute the best option immediately. Never output meta-commentary like "Here is the revised scene" or "Which approach would you prefer". Just output the story content directly.

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
     * CRITICAL: All prompts include autonomous agent instruction to prevent persona break
     */
    buildUserPrompt(context, options, phase) {
        const state = context.state;
        const constraintsBlock = this.buildConstraintsBlock(state.keyConstraints);
        // Critical instruction to prevent persona break - added to ALL user prompts
        // This cannot be overridden by Langfuse system prompts
        const autonomousInstruction = `
CRITICAL: Output ONLY the story prose. DO NOT ask questions. DO NOT offer options (A/B/C). DO NOT include meta-commentary like "Here is the scene" or "Which approach would you prefer". Just write the story content directly.`;
        if (phase === LLMModels_1.GenerationPhase.DRAFTING) {
            const sceneNum = state.currentScene;
            const outline = state.outline;
            const scenes = outline?.scenes || [];
            const sceneOutline = state.currentSceneOutline ?? scenes[sceneNum - 1] ?? {};
            const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);
            // Check if this is an expansion request (scene too short, need to continue)
            if (sceneOutline.expansionMode === true) {
                const existingContent = String(sceneOutline.existingContent ?? "");
                const additionalWordsNeeded = Number(sceneOutline.additionalWordsNeeded ?? 500);
                return `Continue Scene ${sceneNum}: "${sceneTitle}"

The scene so far (DO NOT REWRITE - continue from where it ends):
---
${existingContent}
---

Continue the scene from where it left off. Write approximately ${additionalWordsNeeded} more words.

Requirements:
- Continue seamlessly from the last paragraph
- Maintain the same voice, tone, and style
- Progress the scene toward its conclusion
- DO NOT repeat or summarize what was already written

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${autonomousInstruction}`;
            }
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
${autonomousInstruction}`;
        }
        if (phase === LLMModels_1.GenerationPhase.REVISION) {
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
${autonomousInstruction}`;
        }
        if (phase === LLMModels_1.GenerationPhase.POLISH) {
            const sceneNum = state.currentScene;
            const draft = state.drafts.get(sceneNum);
            if (!draft) {
                throw new Error(`No draft found for scene ${sceneNum}`);
            }
            const currentWordCount = draft.content?.split(/\s+/).length ?? 0;
            return `Polish Scene ${sceneNum} for final publication quality.

Current draft (${currentWordCount} words):
${draft.content}

Polish for:
- Sentence flow and rhythm
- Word choice precision
- Consistency in voice
- Final proofreading

IMPORTANT: Preserve all story beats and maintain word count. Do NOT shorten or summarize. The polished version must be at least ${currentWordCount} words.
${autonomousInstruction}`;
        }
        throw new Error(`WriterAgent not configured for phase: ${phase}`);
    }
    /**
     * Detect persona break patterns in Writer output
     * Returns true if the output contains interactive assistant patterns
     */
    detectPersonaBreak(content) {
        const personaBreakPatterns = [
            /which (?:approach|option|version) (?:would you|do you) prefer/i,
            /\b[ABC]\)\s+/, // A) B) C) options
            /your guidance/i,
            /let me know (?:if|which|what)/i,
            /would you like me to/i,
            /here (?:is|are) (?:the|some) (?:revised|options|approaches)/i,
            /please (?:choose|select|let me know)/i,
            /\?{2,}/, // Multiple question marks
        ];
        return personaBreakPatterns.some(pattern => pattern.test(content));
    }
}
exports.WriterAgent = WriterAgent;
//# sourceMappingURL=WriterAgent.js.map