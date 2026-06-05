/**
 * Slice 1a: the Writer's standard drafting prompt must contain the worldState
 * continuity block and the advancedPlan craft block.
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

function draftContext(): AnyObj {
  return {
    runId: "r", projectId: "p",
    state: {
      currentScene: 3,
      outline: { scenes: [{}, {}, { title: "The Crypt", wordCount: 800 }] },
      currentSceneOutline: { title: "The Crypt", wordCount: 800, retrievedContext: "" },
      keyConstraints: [],
      characters: [{ name: "Mara", role: "lead" }],
      worldState: {
        runId: "r", lastUpdatedScene: 2, lastUpdatedAt: "",
        characters: [{ name: "Vex", role: "foe", status: "dead", currentLocation: "tower", attributes: {}, relationships: {}, lastSeenScene: 2 }],
        locations: [], organizations: [], timeline: [], keyFacts: ["The seal was broken in scene 2."],
      },
      advancedPlan: { motifs: { shadow: "doubt" } },
    },
  };
}

describe("WriterAgent DRAFTING prompt injects continuity + plan", () => {
  it("includes the worldState block (dead character, key fact)", () => {
    const w = makeWriter() as unknown as AnyObj;
    const prompt = (w.buildUserPrompt as (c: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      draftContext(), { projectId: "p" }, GenerationPhase.DRAFTING
    );
    expect(prompt).toContain("Vex");
    expect(prompt).toContain("dead");
    expect(prompt).toContain("seal was broken");
  });

  it("includes the advancedPlan motifs block", () => {
    const w = makeWriter() as unknown as AnyObj;
    const prompt = (w.buildUserPrompt as (c: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      draftContext(), { projectId: "p" }, GenerationPhase.DRAFTING
    );
    expect(prompt).toContain("shadow");
    expect(prompt).toContain("doubt");
  });
});
