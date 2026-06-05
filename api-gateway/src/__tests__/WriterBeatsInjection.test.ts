/**
 * Slice 2: worldState + advancedPlan must be injected into the beats-mode and
 * expansion Writer prompts, not just the standard ≤1000-word path. Beats mode
 * is the DEFAULT for scenes targeting >1000 words.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    get isEnabled() { return false; }
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { WriterAgent } from "../agents/WriterAgent";
import { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

function makeWriter(): WriterAgent {
  const langfuse = { isEnabled: false, startSpan: () => "s", endSpan: () => {}, addEvent: () => {}, trackLLMCall: () => {} } as unknown as ConstructorParameters<typeof WriterAgent>[1];
  const llmProvider = {} as unknown as ConstructorParameters<typeof WriterAgent>[0];
  return new WriterAgent(llmProvider, langfuse, undefined, undefined, { publishEvent: jest.fn(async () => "e") } as unknown as ConstructorParameters<typeof WriterAgent>[4]);
}

function baseState(sceneOutlineExtra: AnyObj): AnyObj {
  return {
    currentScene: 3,
    outline: { scenes: [{}, {}, { title: "The Crypt", wordCount: 1500 }] },
    currentSceneOutline: { title: "The Crypt", wordCount: 1500, ...sceneOutlineExtra },
    keyConstraints: [],
    characters: [{ name: "Mara", role: "lead" }],
    worldState: {
      runId: "r", lastUpdatedScene: 2, lastUpdatedAt: "",
      characters: [{ name: "Vex", role: "foe", status: "dead", currentLocation: "tower", attributes: {}, relationships: {}, lastSeenScene: 2 }],
      locations: [], organizations: [], timeline: [], keyFacts: ["The seal was broken in scene 2."],
    },
    advancedPlan: { motifs: { shadow: "doubt" } },
  };
}

function buildPrompt(state: AnyObj): string {
  const w = makeWriter() as unknown as AnyObj;
  return (w.buildUserPrompt as (c: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
    { runId: "r", projectId: "p", state }, { projectId: "p" }, GenerationPhase.DRAFTING
  );
}

describe("WriterAgent injects continuity + plan into beats/expansion paths", () => {
  it("beats first part includes worldState + advancedPlan", () => {
    const prompt = buildPrompt(baseState({ beatsMode: true, partIndex: 1, partsTotal: 3, partTargetWords: 500, isFirstPart: true }));
    expect(prompt).toContain("Vex");
    expect(prompt).toContain("seal was broken");
    expect(prompt).toContain("shadow");
  });

  it("beats continuation part includes worldState (continuity must not drift)", () => {
    const prompt = buildPrompt(baseState({ beatsMode: true, partIndex: 2, partsTotal: 3, partTargetWords: 500, isFirstPart: false, existingContent: "Some prior text here." }));
    expect(prompt).toContain("Vex");
    expect(prompt).toContain("seal was broken");
  });

  it("expansion path includes worldState", () => {
    const prompt = buildPrompt(baseState({ expansionMode: true, additionalWordsNeeded: 400, existingContent: "Some prior text here." }));
    expect(prompt).toContain("Vex");
    expect(prompt).toContain("seal was broken");
  });
});
