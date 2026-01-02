/**
 * Evaluation Service for MANOE
 * Implements LLM-as-a-Judge evaluation for automatic quality scoring
 * 
 * Features:
 * - Faithfulness evaluation: How well Writer output matches Architect plan
 * - Relevance evaluation: How well Profiler output matches user's seed idea
 * - Records scores in Langfuse and Prometheus metrics
 */

import { Service, Inject } from "@tsed/di";
import { LangfuseService } from "./LangfuseService";
import { LLMProviderService } from "./LLMProviderService";
import { MetricsService } from "./MetricsService";
import { LLMProvider, MessageRole } from "../models/LLMModels";

/**
 * Evaluation result from LLM-as-a-Judge
 */
export interface EvaluationResult {
  score: number;
  reasoning: string;
  evaluationModel: string;
  durationMs: number;
}

/**
 * Faithfulness evaluation input
 */
export interface FaithfulnessInput {
  runId: string;
  writerOutput: string;
  architectPlan: string;
  sceneNumber?: number;
}

/**
 * Relevance evaluation input
 */
export interface RelevanceInput {
  runId: string;
  profilerOutput: string;
  seedIdea: string;
  characterName?: string;
}

/**
 * Evaluation configuration
 */
interface EvaluationConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
}

@Service()
export class EvaluationService {
  @Inject()
  private langfuseService: LangfuseService;

  @Inject()
  private llmProviderService: LLMProviderService;

  @Inject()
  private metricsService: MetricsService;

  private evaluationConfig: EvaluationConfig | null = null;

  constructor() {
    this.initializeConfig();
  }

  /**
   * Initialize evaluation configuration from environment
   * Uses a cheap, fast model for evaluations to minimize cost
   */
  private initializeConfig(): void {
    const provider = (process.env.EVALUATION_LLM_PROVIDER || "openai") as LLMProvider;
    const model = process.env.EVALUATION_LLM_MODEL || "gpt-4o-mini";
    const apiKey = process.env.EVALUATION_LLM_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.warn("EvaluationService: No API key configured, evaluations disabled");
      return;
    }

    this.evaluationConfig = { provider, model, apiKey };
    console.log(`EvaluationService initialized with ${provider}/${model}`);
  }

  /**
   * Check if evaluation is enabled
   */
  get isEnabled(): boolean {
    return this.evaluationConfig !== null;
  }

  /**
   * Evaluate faithfulness - how well Writer output matches Architect plan
   * 
   * @param input - Faithfulness evaluation input
   * @returns Evaluation result with score 0-1
   */
  async evaluateFaithfulness(input: FaithfulnessInput): Promise<EvaluationResult | null> {
    if (!this.evaluationConfig) {
      console.warn("EvaluationService: Faithfulness evaluation skipped - not configured");
      return null;
    }

    const startTime = Date.now();
    const { runId, writerOutput, architectPlan, sceneNumber } = input;

    const prompt = this.buildFaithfulnessPrompt(writerOutput, architectPlan);

    try {
      const response = await this.llmProviderService.createCompletion({
        provider: this.evaluationConfig.provider,
        model: this.evaluationConfig.model,
        apiKey: this.evaluationConfig.apiKey,
        messages: [
          {
            role: MessageRole.SYSTEM,
            content: `You are an expert evaluator assessing how faithfully a writer followed an architect's plan.
You must respond with ONLY a JSON object in this exact format:
{"score": <number 0-1>, "reasoning": "<brief explanation>"}

Score guidelines:
- 1.0: Perfect adherence to the plan
- 0.8-0.9: Minor deviations but captures all key elements
- 0.6-0.7: Some elements missing or changed
- 0.4-0.5: Significant deviations from the plan
- 0.2-0.3: Major elements missing or contradicted
- 0.0-0.1: Completely ignores the plan`,
          },
          {
            role: MessageRole.USER,
            content: prompt,
          },
        ],
        maxTokens: 256,
        runId,
        agentName: "faithfulness_evaluator",
      });

      const durationMs = Date.now() - startTime;
      const result = this.parseEvaluationResponse(response.content, this.evaluationConfig.model, durationMs);

      // Record in Langfuse
      this.langfuseService.scoreFaithfulness(runId, result.score, "writer", result.reasoning);
      this.langfuseService.addEvent(runId, "llm_judge_faithfulness", {
        score: result.score,
        reasoning: result.reasoning,
        sceneNumber,
        evaluationModel: result.evaluationModel,
        durationMs: result.durationMs,
      });

      // Record in Prometheus
      this.metricsService.recordEvaluation("faithfulness", "writer", runId, result.score, durationMs, true);

      console.log(`[EvaluationService] Faithfulness score for run ${runId}: ${result.score}`);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[EvaluationService] Faithfulness evaluation failed:`, error);
      
      // Record failure in Prometheus
      this.metricsService.recordEvaluation("faithfulness", "writer", runId, 0, durationMs, false);
      
      return null;
    }
  }

  /**
   * Evaluate relevance - how well Profiler output matches user's seed idea
   * 
   * @param input - Relevance evaluation input
   * @returns Evaluation result with score 0-1
   */
  async evaluateRelevance(input: RelevanceInput): Promise<EvaluationResult | null> {
    if (!this.evaluationConfig) {
      console.warn("EvaluationService: Relevance evaluation skipped - not configured");
      return null;
    }

    const startTime = Date.now();
    const { runId, profilerOutput, seedIdea, characterName } = input;

    const prompt = this.buildRelevancePrompt(profilerOutput, seedIdea);

    try {
      const response = await this.llmProviderService.createCompletion({
        provider: this.evaluationConfig.provider,
        model: this.evaluationConfig.model,
        apiKey: this.evaluationConfig.apiKey,
        messages: [
          {
            role: MessageRole.SYSTEM,
            content: `You are an expert evaluator assessing how relevant a character profile is to the user's original story idea.
You must respond with ONLY a JSON object in this exact format:
{"score": <number 0-1>, "reasoning": "<brief explanation>"}

Score guidelines:
- 1.0: Character perfectly fits the story concept
- 0.8-0.9: Character fits well with minor adjustments possible
- 0.6-0.7: Character is relevant but could be better aligned
- 0.4-0.5: Character has some relevance but significant gaps
- 0.2-0.3: Character barely relates to the story idea
- 0.0-0.1: Character is completely irrelevant`,
          },
          {
            role: MessageRole.USER,
            content: prompt,
          },
        ],
        maxTokens: 256,
        runId,
        agentName: "relevance_evaluator",
      });

      const durationMs = Date.now() - startTime;
      const result = this.parseEvaluationResponse(response.content, this.evaluationConfig.model, durationMs);

      // Record in Langfuse
      this.langfuseService.scoreRelevance(runId, result.score, "profiler", result.reasoning);
      this.langfuseService.addEvent(runId, "llm_judge_relevance", {
        score: result.score,
        reasoning: result.reasoning,
        characterName,
        evaluationModel: result.evaluationModel,
        durationMs: result.durationMs,
      });

      // Record in Prometheus
      this.metricsService.recordEvaluation("relevance", "profiler", runId, result.score, durationMs, true);

      console.log(`[EvaluationService] Relevance score for run ${runId}: ${result.score}`);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[EvaluationService] Relevance evaluation failed:`, error);
      
      // Record failure in Prometheus
      this.metricsService.recordEvaluation("relevance", "profiler", runId, 0, durationMs, false);
      
      return null;
    }
  }

  /**
   * Build faithfulness evaluation prompt
   */
  private buildFaithfulnessPrompt(writerOutput: string, architectPlan: string): string {
    return `## Architect's Plan
${architectPlan}

## Writer's Output
${writerOutput}

Evaluate how faithfully the writer followed the architect's plan. Consider:
1. Are all key plot points from the plan included?
2. Are character actions consistent with the plan?
3. Is the tone and pacing as specified?
4. Are any important elements missing or contradicted?`;
  }

  /**
   * Build relevance evaluation prompt
   */
  private buildRelevancePrompt(profilerOutput: string, seedIdea: string): string {
    return `## User's Story Idea
${seedIdea}

## Character Profile
${profilerOutput}

Evaluate how relevant this character profile is to the user's story idea. Consider:
1. Does the character fit the genre and setting?
2. Would this character naturally exist in this story world?
3. Does the character's background align with the story's themes?
4. Is the character's role appropriate for the narrative?`;
  }

  /**
   * Parse LLM evaluation response
   */
  private parseEvaluationResponse(content: string, model: string, durationMs: number): EvaluationResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
      const reasoning = String(parsed.reasoning || "No reasoning provided");

      return {
        score,
        reasoning,
        evaluationModel: model,
        durationMs,
      };
    } catch (error) {
      console.warn(`[EvaluationService] Failed to parse evaluation response: ${content}`);
      // Return a default score if parsing fails
      return {
        score: 0.5,
        reasoning: "Failed to parse evaluation response",
        evaluationModel: model,
        durationMs,
      };
    }
  }
}
