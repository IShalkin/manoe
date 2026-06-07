import { buildConstraintsBlock } from "../utils/constraintsBlock";

describe("buildConstraintsBlock (real shipped format)", () => {
  it("returns the empty-state sentence when there are no constraints", () => {
    expect(buildConstraintsBlock([])).toBe("No constraints established yet.");
  });
  it("formats each constraint as '- key: value (Scene N)'", () => {
    const out = buildConstraintsBlock([
      { key: "genre", value: "noir", sceneNumber: 0 },
      { key: "weapon", value: "revolver", sceneNumber: 3 },
    ]);
    expect(out).toBe("- genre: noir (Scene 0)\n- weapon: revolver (Scene 3)");
  });
});
