/**
 * Slice 2: the Strategist ADVANCED_PLANNING prompt must instruct per-scene keys
 * for per-scene categories so buildAdvancedPlanBlock's pick() is exact.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    get isEnabled() { return false; }
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StrategistAgent } from "../agents/StrategistAgent";
import { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

function makeStrategist(): AnyObj {
  const langfuse = { isEnabled: false, startSpan: () => "s", endSpan: () => {}, addEvent: () => {}, trackLLMCall: () => {} } as unknown as ConstructorParameters<typeof StrategistAgent>[1];
  const llmProvider = {} as unknown as ConstructorParameters<typeof StrategistAgent>[0];
  return new StrategistAgent(llmProvider, langfuse) as unknown as AnyObj;
}

describe("Strategist advanced-plan prompt pins per-scene keys", () => {
  it("instructs per-scene numeric-string keys for emotionalBeats and sensory", () => {
    const s = makeStrategist();
    const state = { narrative: {}, outline: { scenes: [{}, {}] }, characters: [] };
    const prompt = (s.buildUserPrompt as (c: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      { runId: "r", projectId: "p", state }, { projectId: "p" }, GenerationPhase.ADVANCED_PLANNING
    );
    expect(prompt).toMatch(/emotionalBeats/);
    expect(prompt).toMatch(/"1"/);
    expect(prompt.toLowerCase()).toMatch(/per scene|scene number as the key|keyed by scene/);
  });
});
