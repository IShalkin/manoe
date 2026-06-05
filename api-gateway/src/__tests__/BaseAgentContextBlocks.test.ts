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

  it("picks the per-scene emotional beat by numeric key", () => {
    const p = probe();
    const plan = { emotionalBeats: { "3": "rising dread", "4": "relief" } };
    const out = (p.buildAdvancedPlanBlock as (pl: unknown, n: number) => string)(plan, 3);
    expect(out).toContain("rising dread");
    expect(out).not.toContain("relief");
  });

  it("picks the per-scene emotional beat by scene-prefixed key", () => {
    const p = probe();
    const plan = { emotionalBeats: { scene3: "longing", scene4: "anger" } };
    const out = (p.buildAdvancedPlanBlock as (pl: unknown, n: number) => string)(plan, 3);
    expect(out).toContain("longing");
    expect(out).not.toContain("anger");
  });

  it("falls back to the whole sub-object when no per-scene key matches", () => {
    const p = probe();
    const plan = { sensory: { palette: "cold blues", sound: "dripping water" } };
    const out = (p.buildAdvancedPlanBlock as (pl: unknown, n: number) => string)(plan, 7);
    expect(out).toContain("cold blues");
    expect(out).toContain("dripping water");
  });
});

describe("BaseAgent.buildNarratorVoiceBlock", () => {
  it("renders voice/perspective/tone/style", () => {
    const p = probe();
    const out = (p.buildNarratorVoiceBlock as (v: unknown) => string)(
      { voice: "wry", perspective: "3rd-limited", tone: "melancholy", style: "spare" }
    );
    expect(out).toContain("3rd-limited");
    expect(out).toContain("wry");
  });
  it("placeholder when undefined", () => {
    const p = probe();
    expect((p.buildNarratorVoiceBlock as (v: unknown) => string)(undefined)).toMatch(/no narrator/i);
  });
});

describe("BaseAgent.buildSynopsisBlock", () => {
  it("renders only entries before the current scene, in order", () => {
    const p = probe();
    const entries = [
      { sceneNumber: 1, summary: "Mara leaves home." },
      { sceneNumber: 2, summary: "Mara meets Vex." },
      { sceneNumber: 3, summary: "FUTURE - must not appear." },
    ];
    const out = (p.buildSynopsisBlock as (e: unknown, n: number) => string)(entries, 3);
    expect(out).toContain("Mara leaves home");
    expect(out).toContain("Mara meets Vex");
    expect(out).not.toContain("FUTURE");
  });
  it("placeholder for scene 1 / empty", () => {
    const p = probe();
    expect((p.buildSynopsisBlock as (e: unknown, n: number) => string)([], 1)).toMatch(/no prior scenes/i);
  });
});

describe("BaseAgent.buildSceneContractBlock", () => {
  it("renders goal/conflict/hook/value-shift/motifs", () => {
    const p = probe();
    const contract = {
      sceneNumber: 4, goal: "escape the tower", conflict: "the guard", hook: "the door slams",
      charactersPresent: ["Mara"], targetWords: 1500, activeMotifs: ["shadow"],
      valueShiftEntering: -2, valueShiftExitingTarget: 3,
    };
    const out = (p.buildSceneContractBlock as (c: unknown) => string)(contract);
    expect(out).toContain("escape the tower");
    expect(out).toContain("the door slams");
    expect(out).toContain("shadow");
    expect(out).toMatch(/-2/);
    expect(out).toMatch(/3/);
  });
  it("placeholder when undefined", () => {
    const p = probe();
    expect((p.buildSceneContractBlock as (c: unknown) => string)(undefined)).toMatch(/no scene contract/i);
  });
});
