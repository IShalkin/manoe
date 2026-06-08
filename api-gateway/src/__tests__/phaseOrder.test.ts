import { GenerationPhase } from "../models/LLMModels";
import { PHASE_CONFIGS, getNextPhase } from "../models/AgentModels";

describe("Generation phase order (real shipped definitions)", () => {
  const expectedOrder: GenerationPhase[] = [
    GenerationPhase.GENESIS,
    GenerationPhase.CHARACTERS,
    GenerationPhase.NARRATOR_DESIGN,
    GenerationPhase.WORLDBUILDING,
    GenerationPhase.OUTLINING,
    GenerationPhase.ADVANCED_PLANNING,
    GenerationPhase.DRAFTING,
    GenerationPhase.CRITIQUE,
    GenerationPhase.REVISION,
    GenerationPhase.ORIGINALITY_CHECK,
    GenerationPhase.IMPACT_ASSESSMENT,
    GenerationPhase.POLISH,
  ];

  it("PHASE_CONFIGS lists all 12 phases in the canonical order", () => {
    expect(PHASE_CONFIGS.map((c) => c.phase)).toEqual(expectedOrder);
  });

  it("includes the phases the fictional test omitted", () => {
    const phases = PHASE_CONFIGS.map((c) => c.phase);
    expect(phases).toContain(GenerationPhase.NARRATOR_DESIGN);
    expect(phases).toContain(GenerationPhase.ORIGINALITY_CHECK);
    expect(phases).toContain(GenerationPhase.IMPACT_ASSESSMENT);
  });

  it("getNextPhase walks PHASE_CONFIGS in order", () => {
    expect(getNextPhase(GenerationPhase.GENESIS)).toBe(GenerationPhase.CHARACTERS);
    expect(getNextPhase(GenerationPhase.CHARACTERS)).toBe(GenerationPhase.NARRATOR_DESIGN);
    expect(getNextPhase(GenerationPhase.NARRATOR_DESIGN)).toBe(GenerationPhase.WORLDBUILDING);
    expect(getNextPhase(GenerationPhase.WORLDBUILDING)).toBe(GenerationPhase.OUTLINING);
    expect(getNextPhase(GenerationPhase.OUTLINING)).toBe(GenerationPhase.ADVANCED_PLANNING);
    expect(getNextPhase(GenerationPhase.ADVANCED_PLANNING)).toBe(GenerationPhase.DRAFTING);
  });

  it("getNextPhase returns null after the final phase", () => {
    expect(getNextPhase(GenerationPhase.POLISH)).toBeNull();
  });

  it("getNextPhase returns null for an unknown phase", () => {
    expect(getNextPhase("not_a_phase" as GenerationPhase)).toBeNull();
  });
});
