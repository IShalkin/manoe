"use strict";
/**
 * Impact Agent
 *
 * Evaluates emotional resonance and reader engagement.
 * Active in: Impact Assessment phase
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpactAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class ImpactAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.IMPACT, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const systemPrompt = await this.getSystemPrompt(context, options);
        const userPrompt = this.buildUserPrompt(context, options);
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, LLMModels_1.GenerationPhase.IMPACT_ASSESSMENT);
        const parsed = this.parseJSON(response);
        const validated = this.validateOutput(parsed, AgentSchemas_1.ImpactReportSchema, runId);
        return { content: validated };
    }
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.IMPACT;
        if (this.langfuse.isEnabled) {
            try {
                return await this.langfuse.getCompiledPrompt(promptName, {}, { fallback: this.getFallbackPrompt() });
            }
            catch (error) {
                console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
            }
        }
        return this.getFallbackPrompt();
    }
    getFallbackPrompt() {
        return `You are the Impact Assessor, an expert in emotional resonance.
Your role is to evaluate how effectively the prose engages readers emotionally.`;
    }
    buildUserPrompt(context, options) {
        const sceneNum = context.state.currentScene;
        const draft = context.state.drafts.get(sceneNum);
        if (!draft) {
            throw new Error(`No draft found for scene ${sceneNum}`);
        }
        return `Assess emotional impact of Scene ${sceneNum}:

${draft.content}

Evaluate:
1. Emotional resonance
2. Reader engagement
3. Character connection
4. Tension and stakes
5. Payoff satisfaction

Output JSON with:
- impact_score: number (1-10)
- emotional_beats: string[]
- engagement_level: "high" | "medium" | "low"
- recommendations: string[]`;
    }
}
exports.ImpactAgent = ImpactAgent;
//# sourceMappingURL=ImpactAgent.js.map