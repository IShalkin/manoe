/**
 * Word count matching the orchestrator's shipped inline form `X.split(/\s+/).length`
 * (used at ~12 sites in StorytellerOrchestrator). Deliberately does NOT filter empty
 * tokens — this preserves the exact behavior of the production code paths (a leading
 * space or an empty string yields the same off-by-one the prod code already lives with).
 * Extracted so the count is defined in exactly one place and tested against real behavior.
 */
export function wordCount(text: string): number {
  return text.split(/\s+/).length;
}
