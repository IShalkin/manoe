/**
 * Slice 2: applySpiceExtraction stores regions on state and returns SOFT text.
 * This is the seam the orchestrator uses right after the Writer returns.
 */
import { applySpiceExtraction } from "../services/spiceParser";
import { GenerationState } from "../models/AgentModels";

describe("applySpiceExtraction", () => {
  it("stores regions for the scene and returns detagged soft text", () => {
    const state = new GenerationState();
    const raw = `A. {{SPICE style="x"}}B.{{/SPICE}} C.`;
    const soft = applySpiceExtraction(state, 3, raw);
    expect(soft).toBe("A. B. C.");
    expect(state.spiceRegions.get(3)).toEqual([{ text: "B.", style: "x" }]);
  });

  it("stores nothing and returns unchanged text when there are no tags", () => {
    const state = new GenerationState();
    const soft = applySpiceExtraction(state, 1, "plain prose");
    expect(soft).toBe("plain prose");
    expect(state.spiceRegions.has(1)).toBe(false);
  });
});
