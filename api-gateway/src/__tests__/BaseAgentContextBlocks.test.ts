/**
 * Slice 1a: BaseAgent gains two render helpers so Writer and Critic can
 * inject the (already-computed) worldState and advancedPlan slice.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { BaseAgent } from "../agents/BaseAgent";

type AnyObj = Record<string, unknown>;

// Minimal concrete subclass to reach the protected helpers.
class ProbeAgent extends (BaseAgent as unknown as { new (...a: unknown[]): AnyObj }) {}

function probe(): AnyObj {
  return new (ProbeAgent as unknown as { new (): AnyObj })();
}

describe("BaseAgent.buildWorldStateBlock", () => {
  it("renders character status/location and key facts", () => {
    const p = probe();
    const ws = {
      runId: "r", lastUpdatedScene: 4, lastUpdatedAt: "",
      characters: [
        { name: "Mara", role: "lead", status: "dead", currentLocation: "crypt", attributes: {}, relationships: {}, lastSeenScene: 4 },
        { name: "Jon", role: "ally", status: "alive", currentLocation: "harbor", attributes: {}, relationships: {}, lastSeenScene: 3 },
      ],
      locations: [], organizations: [], timeline: [],
      keyFacts: ["The bridge collapsed in scene 2."],
    };
    const out = (p.buildWorldStateBlock as (w: unknown) => string)(ws);
    expect(out).toContain("Mara");
    expect(out).toContain("dead");
    expect(out).toContain("crypt");
    expect(out).toContain("bridge collapsed");
  });

  it("returns a safe placeholder when worldState is undefined", () => {
    const p = probe();
    const out = (p.buildWorldStateBlock as (w: unknown) => string)(undefined);
    expect(out).toMatch(/no world state/i);
  });
});

describe("BaseAgent.buildAdvancedPlanBlock", () => {
  it("renders motifs and subtext when present", () => {
    const p = probe();
    const plan = { motifs: { water: "rebirth" }, subtext: { Mara: "guilt" } };
    const out = (p.buildAdvancedPlanBlock as (pl: unknown, n: number) => string)(plan, 3);
    expect(out).toContain("water");
    expect(out).toContain("rebirth");
    expect(out).toContain("guilt");
  });

  it("returns a safe placeholder when plan is undefined", () => {
    const p = probe();
    const out = (p.buildAdvancedPlanBlock as (pl: unknown, n: number) => string)(undefined, 1);
    expect(out).toMatch(/no advanced plan/i);
  });
});
