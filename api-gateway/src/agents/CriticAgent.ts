/**
 * Critic Agent
 * 
 * Evaluates prose quality and provides revision feedback.
 * Active in: Critique, Revision phases
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { CritiqueSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class CriticAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.CRITIC, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;
    const phase = state.phase;

    // Get system prompt from Langfuse or fallback
    const systemPrompt = await this.getSystemPrompt(context, options);

    // Build user prompt based on phase
    const userPrompt = this.buildUserPrompt(context, options, phase);

    // Emit thought for Cinematic UI
    await this.emitThought(runId, "Evaluating prose quality and constraint adherence...", "neutral");

    // Call LLM
    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      phase
    );

    // Parse and validate critique JSON
    const parsed = this.parseJSON(response);
    const validated = this.validateOutput(parsed, CritiqueSchema, runId);
    
    // Determine if revision is needed
    const revisionNeeded = this.isRevisionNeeded(validated as Record<string, unknown>);

    // Emit the actual generated content for the frontend to display
    const content = {
      ...(validated as Record<string, unknown>),
      revision_needed: revisionNeeded,
    };
    await this.emitMessage(runId, content, phase);
    
    if (revisionNeeded) {
      await this.emitThought(runId, "Revision needed. Sending feedback to Writer.", "concerned", AgentType.WRITER);
    } else {
      await this.emitThought(runId, "Scene approved! Moving forward.", "agree");
    }

    return { content };
  }

  /**
   * Determine if revision is needed based on critique
   * Uses Guard Clause Pattern: check failure conditions first, then success conditions
   * This prevents bugs where high scores could bypass issue checks
   */
  private isRevisionNeeded(critique: Record<string, unknown>): boolean {
    const hasIssues = Array.isArray(critique.issues) && critique.issues.length > 0;
    const hasRevisionRequests = Array.isArray(critique.revisionRequests) && critique.revisionRequests.length > 0;
    const score = typeof critique.score === "number" ? critique.score : null;

    // 1. Check hard failures first (guard clauses)
    // Word count compliance is a hard requirement - LLMs often lie about word counts
    if (critique.wordCountCompliance === false) {
      return true;
    }

    // Scope adherence is a hard requirement - scene must stay within outline bounds
    if (critique.scopeAdherence === false) {
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
  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.CRITIC;
    const constraintsBlock = this.buildConstraintsBlock(context.state.keyConstraints);
    
    const variables: Record<string, string> = {
      keyConstraints: constraintsBlock,
    };

    if (this.langfuse.isEnabled) {
      try {
        const prompt = await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(variables) }
        );
        return prompt;
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(variables);
  }

  /**
   * Get fallback prompt
   */
  private getFallbackPrompt(variables: Record<string, string>): string {
    return `You are the Critic, an expert literary evaluator.
Your role is to assess prose quality and provide constructive feedback for improvement.
Check for constraint violations.
Key Constraints: ${variables.keyConstraints || "No constraints established yet."}`;
  }

  /**
   * Compile fallback prompt with variables
   */
  private compileFallbackPrompt(variables: Record<string, string>): string {
    let prompt = this.getFallbackPrompt(variables);
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return prompt;
  }

  /**
   * Build user prompt based on phase
   */
  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions,
    phase: GenerationPhase
  ): string {
    const state = context.state;
    const constraintsBlock = this.buildConstraintsBlock(state.keyConstraints);

    if (phase === GenerationPhase.CRITIQUE) {
      const sceneNum = state.currentScene;
      const draft = state.drafts.get(sceneNum);

      if (!draft) {
        throw new Error(`No draft found for scene ${sceneNum}`);
      }

      // Get target word count from outline
      const outline = state.outline as Record<string, unknown>;
      const scenes = (outline?.scenes as unknown[]) || [];
      const sceneOutline = scenes[sceneNum - 1] as Record<string, unknown> || {};
      const targetWordCount = sceneOutline.wordCount ?? 1500;
      
      // Calculate actual word count (don't trust LLM's self-reported count)
      const actualWordCount = String((draft as Record<string, unknown>).content || "").split(/\s+/).filter(w => w.length > 0).length;
      const wordCountRatio = actualWordCount / Number(targetWordCount);

      // Get scene outline for scope checking
      const sceneHook = sceneOutline.hook ?? sceneOutline.endHook ?? "";

      return `Critique Scene ${sceneNum}:

${(draft as Record<string, unknown>).content}

SCENE OUTLINE (for scope checking):
${JSON.stringify(sceneOutline, null, 2)}

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
9. SCOPE ADHERENCE (CRITICAL):
   - Does the scene cover ONLY what's in the outline?
   - Does it avoid depicting events from later scenes?
   - Does it end on the specified hook: "${sceneHook}"?
   - No premature escalation or resolution of future conflicts?

KEY CONSTRAINTS TO CHECK:
${constraintsBlock}

Output JSON with:
- approved: boolean (true ONLY if no major issues AND word count >= 70% of target AND scope is correct)
- score: number (1-10, max 6 if word count is below 70%, max 7 if scope issues)
- wordCountCompliance: boolean (true if actual >= 70% of target)
- scopeAdherence: boolean (true if scene stays within outline bounds and ends on hook)
- strengths: string[]
- issues: string[] (MUST include "Scene too short" if word count < 70%, "Scope violation" if scene goes beyond outline)
- revisionRequests: string[] (MUST include "Expand scene to at least ${Math.round(Number(targetWordCount) * 0.7)} words" if too short, specific scope fixes if needed)`;
    }

    if (phase === GenerationPhase.REVISION) {
      // Critic may be consulted during revision, but Writer is primary
      // This is a fallback for future use
      return `Review the revised scene for quality and constraint adherence.`;
    }

    throw new Error(`CriticAgent not configured for phase: ${phase}`);
  }
}

