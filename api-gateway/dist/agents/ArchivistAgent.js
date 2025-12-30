"use strict";
/**
 * Archivist Agent
 *
 * Manages continuity constraints and resolves conflicts.
 * Active in: Drafting, Revision, Polish phases (runs every 3 scenes)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchivistAgent = void 0;
const AgentModels_1 = require("../models/AgentModels");
const LLMModels_1 = require("../models/LLMModels");
const LangfuseService_1 = require("../services/LangfuseService");
const BaseAgent_1 = require("./BaseAgent");
const AgentSchemas_1 = require("../schemas/AgentSchemas");
class ArchivistAgent extends BaseAgent_1.BaseAgent {
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        super(AgentModels_1.AgentType.ARCHIVIST, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
    }
    async execute(context, options) {
        const { runId, state } = context;
        const systemPrompt = await this.getSystemPrompt(context, options);
        const userPrompt = this.buildUserPrompt(context, options);
        const response = await this.callLLM(runId, systemPrompt, userPrompt, options.llmConfig, LLMModels_1.GenerationPhase.DRAFTING // Archivist runs during drafting phase
        );
        const parsed = this.parseJSON(response);
        const validated = this.validateOutput(parsed, AgentSchemas_1.ArchivistOutputSchema, runId);
        // Extract key constraints from response
        const constraints = this.extractConstraints(validated, state.currentScene);
        // Emit thought for Cinematic UI
        await this.emitThought(runId, "Processing continuity constraints and resolving conflicts...", "neutral");
        // Emit the actual generated content for the frontend to display
        await this.emitMessage(runId, validated, LLMModels_1.GenerationPhase.DRAFTING);
        if (constraints.length > 0) {
            await this.emitThought(runId, `Updated ${constraints.length} key constraints.`, "neutral");
        }
        return {
            content: validated,
            rawFacts: constraints.map(c => ({
                fact: `${c.key}: ${c.value}`,
                source: AgentModels_1.AgentType.ARCHIVIST,
                sceneNumber: c.sceneNumber,
                timestamp: new Date().toISOString(),
            })),
        };
    }
    /**
     * Extract key constraints from Archivist validated response
     */
    extractConstraints(validated, sceneNumber) {
        const constraints = [];
        if (validated.constraints && Array.isArray(validated.constraints)) {
            for (const constraint of validated.constraints) {
                constraints.push({
                    key: constraint.key,
                    value: constraint.value,
                    source: AgentModels_1.AgentType.ARCHIVIST,
                    sceneNumber: constraint.sceneNumber ?? sceneNumber,
                    timestamp: new Date().toISOString(),
                    reasoning: constraint.reasoning,
                });
            }
        }
        return constraints;
    }
    async getSystemPrompt(context, options) {
        const promptName = LangfuseService_1.AGENT_PROMPTS.ARCHIVIST;
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
        return `You are the Archivist, the keeper of story continuity.
Your role is to track key facts and constraints, resolving conflicts to maintain consistency.
Use Chain of Thought reasoning: IDENTIFY conflicts → RESOLVE by timestamp → DISCARD irrelevant → GENERATE updated list.`;
    }
    buildUserPrompt(context, options) {
        const state = context.state;
        const upToScene = state.currentScene;
        const rawFacts = state.rawFactsLog.filter(f => f.sceneNumber <= upToScene);
        const existingConstraints = state.keyConstraints;
        return `Process raw facts and generate/update key constraints up to Scene ${upToScene}.

Raw facts collected:
${rawFacts.map(f => `- ${f.fact} (Scene ${f.sceneNumber}, from ${f.source})`).join("\n")}

Existing constraints:
${existingConstraints.map(c => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`).join("\n")}

Process:
1. Identify new facts that should become constraints
2. Resolve conflicts (keep most recent by timestamp)
3. Discard irrelevant or redundant facts
4. Generate updated constraint list

Output JSON with:
- constraints: array of {key, value, sceneNumber, reasoning}
- conflicts_resolved: string[]
- discarded_facts: string[]`;
    }
}
exports.ArchivistAgent = ArchivistAgent;
//# sourceMappingURL=ArchivistAgent.js.map