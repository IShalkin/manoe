import { extractStringValue } from "./extractStringValue";

/** Minimal shape the seed-constraint logic touches (a structural subset of KeyConstraint). */
export interface SeedConstraint {
  key: string;
  value: string;
  sceneNumber: number;
  timestamp: string;
  immutable: boolean;
}

/** Minimal state shape: only the fields addSeedConstraints reads/mutates. */
export interface SeedConstraintState {
  keyConstraints: SeedConstraint[];
  narrative?: Record<string, unknown>;
}

/**
 * Add immutable seed constraints (sceneNumber 0) from the Genesis phase.
 * Extracted from StorytellerOrchestrator.addSeedConstraints so it is unit-testable
 * without the full DI graph. Mutates `state.keyConstraints` in place. Pure aside
 * from that mutation (no services, no logging).
 */
export function addSeedConstraints(state: SeedConstraintState, seedIdea: string): void {
  const narrative = (state.narrative || {}) as Record<string, unknown>;
  const timestamp = new Date().toISOString();

  state.keyConstraints.push({
    key: "seed_idea",
    value: seedIdea,
    sceneNumber: 0,
    timestamp,
    immutable: true,
  });

  if (narrative.genre) {
    state.keyConstraints.push({
      key: "genre",
      value: extractStringValue(narrative.genre),
      sceneNumber: 0,
      timestamp,
      immutable: true,
    });
  }

  if (narrative.premise) {
    state.keyConstraints.push({
      key: "premise",
      value: extractStringValue(narrative.premise),
      sceneNumber: 0,
      timestamp,
      immutable: true,
    });
  }

  if (narrative.tone) {
    state.keyConstraints.push({
      key: "tone",
      value: extractStringValue(narrative.tone),
      sceneNumber: 0,
      timestamp,
      immutable: true,
    });
  }

  if (narrative.arc) {
    state.keyConstraints.push({
      key: "narrative_arc",
      value: extractStringValue(narrative.arc),
      sceneNumber: 0,
      timestamp,
      immutable: true,
    });
  }
}
