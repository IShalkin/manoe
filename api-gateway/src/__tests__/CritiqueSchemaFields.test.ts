/**
 * Slice 1a: CritiqueSchema must preserve wordCountCompliance and
 * scopeAdherence — the Critic's isRevisionNeeded hard gates read them,
 * but the non-passthrough schema was stripping them to undefined.
 */
import { CritiqueSchema } from "../schemas/AgentSchemas";

describe("CritiqueSchema preserves hard-gate fields", () => {
  it("keeps wordCountCompliance and scopeAdherence after parse", () => {
    const parsed = CritiqueSchema.parse({
      approved: false, score: 6, revision_needed: true,
      wordCountCompliance: false, scopeAdherence: true,
      issues: ["too short"], revisionRequests: ["expand"],
    });
    expect(parsed.wordCountCompliance).toBe(false);
    expect(parsed.scopeAdherence).toBe(true);
  });

  it("still accepts a critique that omits them (both optional)", () => {
    const parsed = CritiqueSchema.parse({ score: 9 });
    expect(parsed.score).toBe(9);
    expect(parsed.wordCountCompliance).toBeUndefined();
  });
});
