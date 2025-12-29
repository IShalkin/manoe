"use strict";
/**
 * Originality Agent
 *
 * Detects cliches and ensures narrative uniqueness.
 * Active in: Originality Check phase
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OriginalityAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class OriginalityAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.ORIGINALITY, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const systemPrompt = await this.getSystemPrompt(context, options);
        const userPrompt = this.buildUserPrompt(context, options);
        // Emit thought for Cinematic UI
        await this.emitThought(runId, "Checking for cliches and ensuring narrative uniqueness...", "neutral");
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, LLMModels_1.GenerationPhase.ORIGINALITY_CHECK);
        const parsed = this.parseJSON(response);
        const validated = this.validateOutput(parsed, AgentSchemas_1.OriginalityReportSchema, runId);
        // Emit the actual generated content for the frontend to display
        await this.emitMessage(runId, validated, LLMModels_1.GenerationPhase.ORIGINALITY_CHECK);
        const originalityScore = validated.originality_score ?? 0;
        const clichesFound = validated.cliches_found ?? [];
        if (originalityScore >= 8) {
            await this.emitThought(runId, "Highly original content! No major cliches detected.", "excited");
        }
        else if (clichesFound.length > 0) {
            await this.emitThought(runId, `Found ${clichesFound.length} cliches. Consider revisions.`, "concerned");
        }
        else {
            await this.emitThought(runId, "Originality check complete.", "neutral");
        }
        return { content: validated };
    }
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.ORIGINALITY;
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
        return `You are the Originality Checker, a detector of cliches and tropes.
Your role is to identify overused elements and suggest unique alternatives.`;
    }
    buildUserPrompt(context, options) {
        const sceneNum = context.state.currentScene;
        const draft = context.state.drafts.get(sceneNum);
        if (!draft) {
            throw new Error(`No draft found for scene ${sceneNum}`);
        }
        return `Check Scene ${sceneNum} for originality:

${draft.content}

Identify:
1. Cliches and overused tropes
2. Predictable plot elements
3. Generic character moments
4. Unoriginal dialogue patterns

Output JSON with:
- originality_score: number (1-10)
- cliches_found: string[]
- suggestions: string[] (unique alternatives)`;
    }
}
exports.OriginalityAgent = OriginalityAgent;
//# sourceMappingURL=OriginalityAgent.js.map