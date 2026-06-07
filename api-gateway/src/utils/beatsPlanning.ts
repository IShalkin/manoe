/** Scenes longer than this (in target words) are drafted via the Proactive Beats Method. */
export const BEATS_THRESHOLD = 1000;

/** Target words per beat part, used to derive the part count. */
export const WORDS_PER_PART = 500;

/**
 * Whether to use the Proactive Beats Method for a scene of the given target length.
 * Matches StorytellerOrchestrator's inline `targetWordCount > BEATS_THRESHOLD` (~line 988).
 */
export function shouldUseBeatsMethod(targetWordCount: number): boolean {
  return targetWordCount > BEATS_THRESHOLD;
}

/**
 * Number of beat parts for a scene, clamped to [3, 4].
 * Matches StorytellerOrchestrator's inline
 * `Math.min(4, Math.max(3, Math.ceil(targetWordCount / WORDS_PER_PART)))` (~line 1326).
 */
export function calculateBeatsParts(targetWordCount: number): number {
  return Math.min(4, Math.max(3, Math.ceil(targetWordCount / WORDS_PER_PART)));
}
