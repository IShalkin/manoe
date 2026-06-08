import { addSeedConstraints, SeedConstraint } from "../utils/seedConstraints";

describe("addSeedConstraints (real shipped logic)", () => {
  it("adds the seed idea as an immutable scene-0 constraint", () => {
    const state: { keyConstraints: SeedConstraint[]; narrative: Record<string, unknown> } = {
      keyConstraints: [],
      narrative: {},
    };
    addSeedConstraints(state, "A detective story in 1920s Chicago");
    expect(state.keyConstraints).toHaveLength(1);
    expect(state.keyConstraints[0]).toMatchObject({
      key: "seed_idea",
      value: "A detective story in 1920s Chicago",
      sceneNumber: 0,
      immutable: true,
    });
  });

  it("adds every present narrative field in order", () => {
    const state: { keyConstraints: SeedConstraint[]; narrative: Record<string, unknown> } = {
      keyConstraints: [],
      narrative: { genre: "noir", premise: "Detective solves murder", tone: "dark and gritty", arc: "rise and fall" },
    };
    addSeedConstraints(state, "seed");
    expect(state.keyConstraints.map((c) => c.key)).toEqual([
      "seed_idea",
      "genre",
      "premise",
      "tone",
      "narrative_arc",
    ]);
  });

  it("uses extractStringValue for object-type narrative fields", () => {
    const state: { keyConstraints: SeedConstraint[]; narrative: Record<string, unknown> } = {
      keyConstraints: [],
      narrative: { genre: { name: "science fiction", description: "futuristic" } },
    };
    addSeedConstraints(state, "seed");
    expect(state.keyConstraints[1].value).toBe("science fiction");
  });

  it("handles a missing narrative (only the seed idea is added)", () => {
    const state: { keyConstraints: SeedConstraint[]; narrative?: Record<string, unknown> } = {
      keyConstraints: [],
      narrative: undefined,
    };
    addSeedConstraints(state, "seed");
    expect(state.keyConstraints).toHaveLength(1);
  });
});
