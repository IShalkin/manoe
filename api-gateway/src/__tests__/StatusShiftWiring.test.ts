/**
 * Slice 1: statusShift renders in the scene-contract block when present, and is
 * silently omitted when absent (Johnstone power axis, distinct from value-shift).
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { BaseAgent } from "../agents/BaseAgent";

type AnyObj = Record<string, unknown>;
class ProbeAgent extends (BaseAgent as unknown as { new (...a: unknown[]): AnyObj }) {}
function probe(): AnyObj {
  return new (ProbeAgent as unknown as { new (): AnyObj })();
}

const base = {
  sceneNumber: 1, goal: "g", conflict: "c", hook: "h",
  charactersPresent: ["Mara"], targetWords: 1500, activeMotifs: [],
  valueShiftEntering: 0, valueShiftExitingTarget: 3,
};

describe("buildSceneContractBlock statusShift", () => {
  it("renders the status trajectory when present", () => {
    const p = probe();
    const out = (p.buildSceneContractBlock as (c: unknown) => string)(
      { ...base, statusShift: "Mara enters low, ends dominant" }
    );
    expect(out).toContain("Mara enters low, ends dominant");
  });

  it("omits the status line when absent", () => {
    const p = probe();
    const out = (p.buildSceneContractBlock as (c: unknown) => string)(base);
    expect(out.toLowerCase()).not.toContain("status");
  });
});
