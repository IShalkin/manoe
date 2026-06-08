/**
 * Pure revision-gate logic, extracted from CriticAgent so it can be unit-tested
 * against the SAME code the orchestrator runs (issue #165). No `this`, no services.
 *
 * Guard-clause pattern: check hard failures first, then success conditions.
 * Default-to-revision keeps the gate safe when the critique is ambiguous.
 */
export function isRevisionNeeded(critique: Record<string, unknown>): boolean {
  const hasIssues = Array.isArray(critique.issues) && critique.issues.length > 0;
  const hasRevisionRequests =
    Array.isArray(critique.revisionRequests) && critique.revisionRequests.length > 0;
  const score = typeof critique.score === "number" ? critique.score : null;

  // 1. Hard failures (guard clauses)
  if (critique.wordCountCompliance === false) return true;
  if (critique.scopeAdherence === false) return true;
  if (score !== null && score < 7) return true;
  if (score !== null && score < 8 && hasIssues) return true;
  if (hasIssues || hasRevisionRequests) return true;

  // 2. Success conditions. A high score passes UNLESS the critique explicitly
  // disapproved (approved === false) — an explicit veto must force revision even
  // when the score is high.
  if (score !== null && score >= 8 && critique.approved !== false) return false;

  // 3. Default to safe behavior
  return true;
}

/**
 * Word-count compliance: the Critic must not trust an LLM's self-reported count.
 * Compliant when the draft reaches at least 70% of the target word count.
 */
export function calculateWordCountCompliance(
  actualWordCount: number,
  targetWordCount: number
): { compliant: boolean; ratio: number } {
  // Guard against a missing/zero/invalid target (would yield Infinity/NaN and a
  // bogus gate decision). With no usable target we cannot judge compliance, so
  // treat it as compliant (the gate has other signals) and report ratio 0.
  if (!Number.isFinite(targetWordCount) || targetWordCount <= 0) {
    return { compliant: true, ratio: 0 };
  }
  const ratio = actualWordCount / targetWordCount;
  return { compliant: ratio >= 0.7, ratio };
}
