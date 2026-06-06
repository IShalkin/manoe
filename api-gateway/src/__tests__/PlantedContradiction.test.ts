/**
 * Slice 2 (design §9): with a dead character in worldState and a draft where
 * that character acts, the Critic's assembled prompt must surface BOTH the
 * "dead" fact and the draft action, so the contradiction is judgeable.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    get isEnabled() { return false; }
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { CriticAgent } from "../agents/CriticAgent";
import { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

function makeCritic(): AnyObj {
  const langfuse = { isEnabled: false, startSpan: () => "s", endSpan: () => {}, addEvent: () => {}, trackLLMCall: () => {} } as unknown as ConstructorParameters<typeof CriticAgent>[1];
  const llmProvider = {} as unknown as ConstructorParameters<typeof CriticAgent>[0];
  return new CriticAgent(llmProvider, langfuse) as unknown as AnyObj;
}

describe("planted contradiction is visible to the Critic", () => {
  it("prompt carries the dead-status fact and the contradicting draft action", () => {
    const drafts = new Map<number, AnyObj>();
    drafts.set(5, { content: "Vex laughed and drew his sword, very much alive." });
    const state: AnyObj = {
      currentScene: 5,
      outline: { scenes: Array.from({ length: 5 }, (_, i) => ({ title: `S${i + 1}`, wordCount: 500, hook: "h" })) },
      drafts, keyConstraints: [],
      characters: [{ name: "Vex", role: "foe" }, { name: "Mara", role: "lead" }],
      rollingSynopsis: [{ sceneNumber: 4, summary: "Vex was killed in the tomb." }],
      worldState: {
        runId: "r", lastUpdatedScene: 4, lastUpdatedAt: "",
        characters: [{ name: "Vex", role: "foe", status: "dead", currentLocation: "tomb", attributes: {}, relationships: {}, lastSeenScene: 4 }],
        locations: [], organizations: [], timeline: [], keyFacts: ["Vex died in scene 4."],
      },
    };
    const c = makeCritic();
    const prompt = (c.buildUserPrompt as (x: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      { runId: "r", projectId: "p", state }, { projectId: "p" }, GenerationPhase.CRITIQUE
    );
    // The draft action:
    expect(prompt).toContain("drew his sword");
    // The contradicting facts (worldState status + synopsis + keyFact):
    expect(prompt).toContain("dead");
    expect(prompt).toContain("Vex died in scene 4");
    expect(prompt).toContain("Vex was killed in the tomb");
  });
});
