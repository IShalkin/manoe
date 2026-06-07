export interface RunPhaseRecord {
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  temperature: number;
  seed?: number;
  maxTokens: number;
  recordedAt: string;
}

export interface RunConfigArtifact {
  runId: string;
  seed: number;
  requested: { provider: string; model: string; temperature: number };
  phases: Record<string, RunPhaseRecord>;
}

export function createRunConfig(
  runId: string,
  seed: number,
  requested: { provider: string; model: string; temperature: number }
): RunConfigArtifact {
  return { runId, seed, requested, phases: {} };
}

/**
 * Record (or overwrite) the per-phase entry. Last write per phase wins — a phase
 * may run multiple LLM calls (revision loop); we keep the most recent resolved model.
 * Returns the same object (mutated) for convenience.
 */
export function recordPhase(
  config: RunConfigArtifact,
  phase: string,
  rec: Omit<RunPhaseRecord, "recordedAt">,
  recordedAt: string
): RunConfigArtifact {
  config.phases[phase] = { ...rec, recordedAt };
  return config;
}
