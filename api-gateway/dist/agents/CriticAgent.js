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
     * Uses Guard Clause Pattern: check failure conditions first, then success conditions
     * This prevents bugs where high scores could bypass issue checks
     */
    isRevisionNeeded(critique) {
        const hasIssues = Array.isArray(critique.issues) && critique.issues.length > 0;
        const hasRevisionRequests = Array.isArray(critique.revisionRequests) && critique.revisionRequests.length > 0;
        const score = typeof critique.score === "number" ? critique.score : null;
        // 1. Check hard failures first (guard clauses)
        // Word count compliance is a hard requirement - LLMs often lie about word counts
        if (critique.wordCountCompliance === false) {
            return true;
        }
        // Score below 7 always needs revision
        if (score !== null && score < 7) {
            return true;
        }
        // Score 7-8 needs revision if there are any issues
        if (score !== null && score < 8 && hasIssues) {
            return true;
        }
        // Any issues or revision requests require revision (even with high score)
        if (hasIssues || hasRevisionRequests) {
            return true;
        }
        // 2. Check success conditions
        // Only approve if explicitly approved AND score is high
        if (critique.approved === true && score !== null && score >= 8) {
            return false;
        }
        // High score without issues is approved
        if (score !== null && score >= 8) {
            return false;
        }
        // 3. Default to safe behavior - require revision if uncertain
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
            // Get target word count from outline
            const outline = state.outline;
            const scenes = outline?.scenes || [];
            const sceneOutline = scenes[sceneNum - 1] || {};
            const targetWordCount = sceneOutline.wordCount ?? 1500;
            // Calculate actual word count (don't trust LLM's self-reported count)
            const actualWordCount = String(draft.content || "").split(/\s+/).filter(w => w.length > 0).length;
            const wordCountRatio = actualWordCount / Number(targetWordCount);
            return `Critique Scene ${sceneNum}:

${draft.content}

WORD COUNT CHECK (CRITICAL):
- Target word count: ${targetWordCount} words
- Actual word count: ${actualWordCount} words
- Compliance: ${wordCountRatio >= 0.7 ? "PASS" : "FAIL"} (${Math.round(wordCountRatio * 100)}% of target)
${wordCountRatio < 0.7 ? "⚠️ SCENE IS TOO SHORT - MUST REQUEST EXPANSION" : ""}

Evaluate:
1. Prose quality (clarity, flow, voice)
2. Character consistency
3. Emotional impact
4. Pacing
5. Dialogue authenticity
6. Sensory details
7. Constraint adherence
8. Word count compliance (MUST be at least 70% of target)

KEY CONSTRAINTS TO CHECK:
${constraintsBlock}

Output JSON with:
- approved: boolean (true ONLY if no major issues AND word count >= 70% of target)
- score: number (1-10, max 6 if word count is below 70%)
- wordCountCompliance: boolean (true if actual >= 70% of target)
- strengths: string[]
- issues: string[] (MUST include "Scene too short" if word count < 70%)
- revisionRequests: string[] (MUST include "Expand scene to at least ${Math.round(Number(targetWordCount) * 0.7)} words" if too short)`;
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