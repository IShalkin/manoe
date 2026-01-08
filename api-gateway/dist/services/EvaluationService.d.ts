/**
 * Evaluation Service for MANOE
 * Implements LLM-as-a-Judge evaluation for automatic quality scoring
 *
 * Features:
 * - Faithfulness evaluation: How well Writer output matches Architect plan
 * - Relevance evaluation: How well Profiler output matches user's seed idea
 * - Records scores in Langfuse and Prometheus metrics
 */
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
export declare class EvaluationService {
    private langfuseService;
    private llmProviderService;
    private metricsService;
    private evaluationConfig;
    constructor();
    /**
     * Initialize evaluation configuration from environment
     * Uses a cheap, fast model for evaluations to minimize cost
     */
    private initializeConfig;
    /**
     * Check if evaluation is enabled
     */
    get isEnabled(): boolean;
    /**
     * Evaluate faithfulness - how well Writer output matches Architect plan
     *
     * @param input - Faithfulness evaluation input
     * @returns Evaluation result with score 0-1
     */
    evaluateFaithfulness(input: FaithfulnessInput): Promise<EvaluationResult | null>;
    /**
     * Evaluate relevance - how well Profiler output matches user's seed idea
     *
     * @param input - Relevance evaluation input
     * @returns Evaluation result with score 0-1
     */
    evaluateRelevance(input: RelevanceInput): Promise<EvaluationResult | null>;
    /**
     * Build faithfulness evaluation prompt
     */
    private buildFaithfulnessPrompt;
    /**
     * Build relevance evaluation prompt
     */
    private buildRelevancePrompt;
    /**
     * Parse LLM evaluation response
     * Returns null if parsing fails to distinguish from actual scores
     */
    private parseEvaluationResponse;
}
//# sourceMappingURL=EvaluationService.d.ts.map