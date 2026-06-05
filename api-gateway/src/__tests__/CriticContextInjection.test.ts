/**
 * Slice 1a: the Critic's critique prompt must contain the character roster
 * and the worldState block so it can verify the consistency it is asked to
 * judge (e.g. a character marked dead must not act in the draft).
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
  return new CriticAgent(llmProvider, langfuse, undefined, undefined, { publishEvent: jest.fn(async () => "e") } as unknown as ConstructorParameters<typeof CriticAgent>[4]) as unknown as AnyObj;
}

function critiqueContext(): AnyObj {
  const drafts = new Map<number, AnyObj>();
  drafts.set(2, { content: "Vex laughed and drew his sword." });
  return {
    runId: "r", projectId: "p",
    state: {
      currentScene: 2,
      outline: { scenes: [{}, { title: "Duel", wordCount: 500, hook: "the blade falls" }] },
      drafts,
      keyConstraints: [],
      characters: [{ name: "Vex", role: "foe" }, { name: "Mara", role: "lead" }],
      worldState: {
        runId: "r", lastUpdatedScene: 1, lastUpdatedAt: "",
        characters: [{ name: "Vex", role: "foe", status: "dead", currentLocation: "tomb", attributes: {}, relationships: {}, lastSeenScene: 1 }],
        locations: [], organizations: [], timeline: [], keyFacts: [],
      },
    },
  };
}

describe("CriticAgent CRITIQUE prompt injects roster + worldState", () => {
  it("includes the character roster", () => {
    const c = makeCritic();
    const prompt = (c.buildUserPrompt as (x: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      critiqueContext(), { projectId: "p" }, GenerationPhase.CRITIQUE
    );
    expect(prompt).toContain("Mara");
    expect(prompt).toContain("(lead)");
  });

  it("includes the worldState block so a dead-character contradiction is checkable", () => {
    const c = makeCritic();
    const prompt = (c.buildUserPrompt as (x: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      critiqueContext(), { projectId: "p" }, GenerationPhase.CRITIQUE
    );
    expect(prompt).toContain("Vex");
    expect(prompt).toContain("dead");
  });
});

describe("CriticAgent CRITIQUE prompt injects voice + synopsis + contract + rubric", () => {
  function ctxWithExtras(): AnyObj {
    const c = critiqueContext();
    const s = (c.state as AnyObj);
    s.narratorVoice = { perspective: "3rd-limited" };
    s.rollingSynopsis = [{ sceneNumber: 1, summary: "Vex died in the tomb." }];
    s.currentSceneContract = { sceneNumber: 2, goal: "duel", conflict: "swords", hook: "the blade falls", charactersPresent: ["Mara"], targetWords: 500, activeMotifs: ["fire"], valueShiftEntering: 0, valueShiftExitingTarget: 3 };
    return c;
  }
  it("includes synopsis, narrator voice, contract, and rubric instructions", () => {
    const c = makeCritic();
    const prompt = (c.buildUserPrompt as (x: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      ctxWithExtras(), { projectId: "p" }, GenerationPhase.CRITIQUE
    );
    expect(prompt).toContain("Vex died in the tomb");
    expect(prompt).toContain("3rd-limited");
    expect(prompt).toContain("beatDelivery");
    expect(prompt).toContain("valueShiftDelivered");
  });
});
