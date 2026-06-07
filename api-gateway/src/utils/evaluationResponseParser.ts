/**
 * Result of an LLM-judge evaluation. Score is on a 0..1 scale.
 * (Moved here from EvaluationService for issue #165 so the parser is testable
 * against the shipped code path without constructing the DI service.)
 */
export interface EvaluationResult {
  score: number;
  reasoning: string;
  evaluationModel: string;
  durationMs: number;
}

/**
 * Parse an LLM evaluation response. Returns null on parse failure so callers can
 * distinguish "no score" from a real low score (rather than masking with 0).
 */
export function parseEvaluationResponse(
  content: string,
  model: string,
  durationMs: number
): EvaluationResult | null {
  try {
    // Non-greedy first balanced JSON object.
    const jsonMatch = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
    const reasoning = String(parsed.reasoning || "No reasoning provided");

    return { score, reasoning, evaluationModel: model, durationMs };
  } catch (error) {
    console.warn(`[EvaluationService] Failed to parse evaluation response: ${content}`);
    return null;
  }
}
