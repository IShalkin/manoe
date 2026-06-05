/**
 * Slice 1: BaseAgent.buildVoiceExemplarsBlock renders exemplar lines for the
 * present characters only, so voices contrast within the scene.
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

describe("BaseAgent.buildVoiceExemplarsBlock", () => {
  const characters = [
    { name: "Mara", voiceExemplars: ["I don't run. I relocate."] },
    { name: "Vex", voiceExemplars: ["Everyone leaves a mark. You left a stain."] },
    { name: "Jon", voiceExemplars: ["Reckon we ought head home."] },
  ];

  it("renders exemplars only for present characters", () => {
    const p = probe();
    const out = (p.buildVoiceExemplarsBlock as (c: unknown, present: string[]) => string)(
      characters, ["Mara", "Vex"]
    );
    expect(out).toContain("Mara");
    expect(out).toContain("I relocate");
    expect(out).toContain("Vex");
    expect(out).toContain("stain");
    expect(out).not.toContain("Jon");
    expect(out).not.toContain("head home");
  });

  it("placeholder when no present character has exemplars", () => {
    const p = probe();
    const out = (p.buildVoiceExemplarsBlock as (c: unknown, present: string[]) => string)(
      [{ name: "Mara" }], ["Mara"]
    );
    expect(out).toMatch(/no voice exemplars/i);
  });

  it("placeholder when characters list is empty/undefined", () => {
    const p = probe();
    expect((p.buildVoiceExemplarsBlock as (c: unknown, present: string[]) => string)(undefined, ["Mara"]))
      .toMatch(/no voice exemplars/i);
  });
});
