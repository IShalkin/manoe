/**
 * Unit Tests for EvaluationService
 *
 * Tests the LLM-as-a-Judge evaluation system logic
 * These tests verify the core logic functions without importing the actual service
 * to avoid issues with langfuse's dynamic imports in Jest.
 *
 * The actual service integration is tested via end-to-end tests.
 */
interface EvaluationResult {
    score: number;
    reasoning: string;
    evaluationModel: string;
    durationMs: number;
}
interface FaithfulnessInput {
    runId: string;
    writerOutput: string;
    architectPlan: string;
    sceneNumber?: number;
}
interface RelevanceInput {
    runId: string;
    profilerOutput: string;
    seedIdea: string;
    characterName?: string;
}
/**
 * Parse LLM evaluation response
 * This is the same logic as in EvaluationService.parseEvaluationResponse
 */
declare function parseEvaluationResponse(content: string, model: string, durationMs: number): EvaluationResult | null;
/**
 * Build faithfulness evaluation prompt
 * This is the same logic as in EvaluationService.buildFaithfulnessPrompt
 */
declare function buildFaithfulnessPrompt(writerOutput: string, architectPlan: string): string;
/**
 * Build relevance evaluation prompt
 * This is the same logic as in EvaluationService.buildRelevancePrompt
 */
declare function buildRelevancePrompt(profilerOutput: string, seedIdea: string): string;
//# sourceMappingURL=EvaluationService.test.d.ts.map