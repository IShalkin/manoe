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

  // 2. Success conditions
  if (critique.approved === true && score !== null && score >= 8) return false;
  if (score !== null && score >= 8) return false;

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
  const ratio = actualWordCount / targetWordCount;
  return { compliant: ratio >= 0.7, ratio };
}
