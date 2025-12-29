"use strict";
/**
 * Critic Agent
 *
 * Evaluates prose quality and provides revision feedback.
 * Active in: Critique, Revision phases
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CriticAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class CriticAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.CRITIC, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const phase = state.phase;
        // Get system prompt from Langfuse or fallback
        const systemPrompt = await this.getSystemPrompt(context, options);
        // Build user prompt based on phase
        const userPrompt = this.buildUserPrompt(context, options, phase);
        // Emit thought for Cinematic UI
        await this.emitThought(runId, "Evaluating prose quality and constraint adherence...", "neutral");
        // Call LLM
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, phase);
        // Parse and validate critique JSON
        const parsed = this.parseJSON(response);
        const validated = this.validateOutput(parsed, AgentSchemas_1.CritiqueSchema, runId);
        // Determine if revision is needed
        const revisionNeeded = this.isRevisionNeeded(validated);
        // Emit the actual generated content for the frontend to display
        const content = {
            ...validated,
            revision_needed: revisionNeeded,
        };
        await this.emitMessage(runId, content, phase);
        if (revisionNeeded) {
            await this.emitThought(runId, "Revision needed. Sending feedback to Writer.", "concerned", AgentModels_1.AgentType.WRITER);
        }
        else {
            await this.emitThought(runId, "Scene approved! Moving forward.", "agree");
        }
        return { content };
    }
    /**
     * Determine if revision is needed based on critique
     */
    isRevisionNeeded(critique) {
        // Check explicit approval
        if (critique.approved === true) {
            return false;
        }
        // Check score threshold (8+ is approved)
        if (typeof critique.score === "number" && critique.score >= 8) {
            return false;
        }
        // Check if there are issues that need addressing
        if (Array.isArray(critique.issues) && critique.issues.length > 0) {
            return true;
        }
        // Check if there are revision requests
        if (Array.isArray(critique.revisionRequests) && critique.revisionRequests.length > 0) {
            return true;
        }
        // Default to needing revision if not explicitly approved
        return true;
    }
    /**
     * Get system prompt from Langfuse or fallback
     */
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.CRITIC;
        const constraintsBlock = this.buildConstraintsBlock(context.state.keyConstraints);
        const variables = {
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
        return `You are the Critic, an expert literary evaluator.
Your role is to assess prose quality and provide constructive feedback for improvement.
Check for constraint violations.
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
        if (phase === LLMModels_1.GenerationPhase.CRITIQUE) {
            const sceneNum = state.currentScene;
            const draft = state.drafts.get(sceneNum);
            if (!draft) {
                throw new Error(`No draft found for scene ${sceneNum}`);
            }
            return `Critique Scene ${sceneNum}:

${draft.content}

Evaluate:
1. Prose quality (clarity, flow, voice)
2. Character consistency
3. Emotional impact
4. Pacing
5. Dialogue authenticity
6. Sensory details
7. Constraint adherence

KEY CONSTRAINTS TO CHECK:
${constraintsBlock}

Output JSON with:
- approved: boolean (true if no major issues)
- score: number (1-10)
- strengths: string[]
- issues: string[]
- revisionRequests: string[] (specific changes needed)`;
        }
        if (phase === LLMModels_1.GenerationPhase.REVISION) {
            // Critic may be consulted during revision, but Writer is primary
            // This is a fallback for future use
            return `Review the revised scene for quality and constraint adherence.`;
        }
        throw new Error(`CriticAgent not configured for phase: ${phase}`);
    }
}
exports.CriticAgent = CriticAgent;
//# sourceMappingURL=CriticAgent.js.map