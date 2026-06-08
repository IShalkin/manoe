/**
 * Evaluation Service for MANOE
 * Implements LLM-as-a-Judge evaluation for automatic quality scoring
 *
 * Features:
 * - Faithfulness evaluation: How well Writer output matches Architect plan
 * - Relevance evaluation: How well Profiler output matches user's seed idea
 * - Records scores in Langfuse and Prometheus metrics
 * - N=3 samples at temperature 0; median reported (issue #168)
 */

import { Service, Inject } from "@tsed/di";
import { LangfuseService } from "./LangfuseService";
import { LLMProviderService } from "./LLMProviderService";
import { MetricsService } from "./MetricsService";
import { LLMProvider, MessageRole } from "../models/LLMModels";
import { parseEvaluationResponse as parseJudgeResponse, EvaluationResult } from "../utils/evaluationResponseParser";
import { median } from "../utils/median";

// Re-export so existing importers of EvaluationResult from this module continue to work.
export { EvaluationResult } from "../utils/evaluationResponseParser";

// ---------------------------------------------------------------------------
// Rubric system-prompt constants (DRY — used by sampleJudge)
// ---------------------------------------------------------------------------

const FAITHFULNESS_SYSTEM = `You are an expert evaluator assessing how faithfully a writer followed an architect's plan.
You must respond with ONLY a JSON object in this exact format:
{"score": <number 0-1>, "reasoning": "<brief explanation>"}

Score guidelines:
- 1.0: Perfect adherence to the plan
- 0.8-0.9: Minor deviations but captures all key elements
- 0.6-0.7: Some elements missing or changed
- 0.4-0.5: Significant deviations from the plan
- 0.2-0.3: Major elements missing or contradicted
- 0.0-0.1: Completely ignores the plan`;

const RELEVANCE_SYSTEM = `You are an expert evaluator assessing how relevant a character profile is to the user's original story idea.
You must respond with ONLY a JSON object in this exact format:
{"score": <number 0-1>, "reasoning": "<brief explanation>"}

Score guidelines:
- 1.0: Character perfectly fits the story concept
- 0.8-0.9: Character fits well with minor adjustments possible
- 0.6-0.7: Character is relevant but could be better aligned
- 0.4-0.5: Character has some relevance but significant gaps
- 0.2-0.3: Character barely relates to the story idea
- 0.0-0.1: Character is completely irrelevant`;

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

  /**
   * Self-consistency samples per evaluation. Median is reported. Override via
   * EVALUATION_SAMPLES. Parsed as a finite integer and clamped to [1, 10] so a
   * non-integer/Infinity value can never create an unbounded judge loop.
   */
  private readonly sampleCount: number = (() => {
    const configured = Number.parseInt(process.env.EVALUATION_SAMPLES || "", 10);
    return Number.isFinite(configured) ? Math.min(10, Math.max(1, configured)) : 3;
  })();

  constructor() {
    this.initializeConfig();
  }

  /**
   * Initialize evaluation configuration from environment
   * Uses a cheap, fast model for evaluations to minimize cost
   */
  private initializeConfig(): void {
    const provider = (process.env.EVALUATION_LLM_PROVIDER || "openai") as LLMProvider;
    const model = process.env.EVALUATION_LLM_MODEL || "gpt-5.4-mini";
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
   * Run the judge `sampleCount` times at temperature 0 and return the median-score
   * result. Determinism (temp 0) + median reduces single-sample noise. The judge is
   * an OBSERVABILITY signal only — it gates nothing (issue #168).
   */
  private async sampleJudge(
    systemPrompt: string,
    userPrompt: string,
    runId: string,
    agentName: string
  ): Promise<EvaluationResult | null> {
    if (!this.evaluationConfig) return null;
    const startTime = Date.now();
    const results: EvaluationResult[] = [];

    for (let i = 0; i < this.sampleCount; i++) {
      try {
        const response = await this.llmProviderService.createCompletion({
          provider: this.evaluationConfig.provider,
          model: this.evaluationConfig.model,
          apiKey: this.evaluationConfig.apiKey,
          messages: [
            { role: MessageRole.SYSTEM, content: systemPrompt },
            { role: MessageRole.USER, content: userPrompt },
          ],
          temperature: 0,
          maxTokens: 512,
          runId,
          agentName,
        });
        const parsed = this.parseEvaluationResponse(response.content, this.evaluationConfig.model, Date.now() - startTime);
        if (parsed) results.push(parsed);
      } catch (err) {
        console.warn(`[EvaluationService] judge sample ${i + 1}/${this.sampleCount} failed: ${String(err)}`);
      }
    }

    if (results.length === 0) return null;

    const med = median(results.map(r => r.score));
    // Pick the sample whose score is closest to the median for its reasoning.
    const repr = results.reduce((best, r) =>
      Math.abs(r.score - med) < Math.abs(best.score - med) ? r : best, results[0]);

    return {
      score: med,
      reasoning: repr.reasoning,
      evaluationModel: this.evaluationConfig.model,
      durationMs: Date.now() - startTime,
    };
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

    const result = await this.sampleJudge(FAITHFULNESS_SYSTEM, prompt, runId, "faithfulness_evaluator");

    const durationMs = Date.now() - startTime;
    if (!result) {
      this.metricsService.recordEvaluation("faithfulness", "writer", runId, 0, durationMs, false);
      return null;
    }
    this.langfuseService.scoreFaithfulness(runId, result.score, "writer", result.reasoning);
    this.langfuseService.addEvent(runId, "llm_judge_faithfulness", {
      score: result.score, scale: "0-1", samples: this.sampleCount,
      reasoning: result.reasoning, sceneNumber,
      evaluationModel: result.evaluationModel, durationMs: result.durationMs,
    });
    this.metricsService.recordEvaluation("faithfulness", "writer", runId, result.score, durationMs, true);
    console.log(`[EvaluationService] Faithfulness (median of ${this.sampleCount}) for run ${runId}: ${result.score}`);
    return result;
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

    const result = await this.sampleJudge(RELEVANCE_SYSTEM, prompt, runId, "relevance_evaluator");

    const durationMs = Date.now() - startTime;
    if (!result) {
      this.metricsService.recordEvaluation("relevance", "profiler", runId, 0, durationMs, false);
      return null;
    }
    this.langfuseService.scoreRelevance(runId, result.score, "profiler", result.reasoning);
    this.langfuseService.addEvent(runId, "llm_judge_relevance", {
      score: result.score, scale: "0-1", samples: this.sampleCount,
      reasoning: result.reasoning, characterName,
      evaluationModel: result.evaluationModel, durationMs: result.durationMs,
    });
    this.metricsService.recordEvaluation("relevance", "profiler", runId, result.score, durationMs, true);
    console.log(`[EvaluationService] Relevance (median of ${this.sampleCount}) for run ${runId}: ${result.score}`);
    return result;
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
   * Returns null if parsing fails to distinguish from actual scores
   */
  private parseEvaluationResponse(content: string, model: string, durationMs: number): EvaluationResult | null {
    return parseJudgeResponse(content, model, durationMs);
  }
}
