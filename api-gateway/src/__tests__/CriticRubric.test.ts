/**
 * Slice 2: CritiqueSchema preserves the decomposed rubric sub-scores and the
 * achieved value-shift; existing gate fields are untouched.
 */
import { CritiqueSchema } from "../schemas/AgentSchemas";

describe("CritiqueSchema rubric fields", () => {
  it("preserves rubric sub-scores and valueShiftDelivered", () => {
    const parsed = CritiqueSchema.parse({
      score: 8, approved: true, wordCountCompliance: true, scopeAdherence: true,
      rubric: { beatDelivery: 8, continuity: 9, characterVoice: 7, proseCraft: 8, pacing: 7, motifPayoff: 6, valueShift: 8 },
      valueShiftDelivered: 4,
    });
    expect(parsed.rubric?.continuity).toBe(9);
    expect(parsed.valueShiftDelivered).toBe(4);
  });
  it("still accepts a critique without rubric (all optional)", () => {
    const parsed = CritiqueSchema.parse({ score: 9 });
    expect(parsed.score).toBe(9);
    expect(parsed.rubric).toBeUndefined();
  });
});
