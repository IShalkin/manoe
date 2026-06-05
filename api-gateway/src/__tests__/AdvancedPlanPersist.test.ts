/**
 * Slice 1a: the Strategist's advanced plan must be written to run state
 * (state.advancedPlan), not just saved as a Supabase artifact, so the
 * Writer can read motifs/subtext/beats downstream.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;

describe("runAdvancedPlanningPhase persists advancedPlan to state", () => {
  it("assigns the Strategist output to state.advancedPlan", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;

    const runId = "run-1";
    const state: AnyObj = {
      runId, projectId: "proj-1", outline: { scenes: [] }, updatedAt: "",
    };
    o.activeRuns = new Map([[runId, state]]);

    const planContent = { motifs: { water: "rebirth" }, subtext: { a: "b" } };
    o.agentFactory = { getAgent: () => ({ execute: async () => ({ content: planContent }) }) };
    o.publishPhaseStart = jest.fn(async () => {});
    o.publishPhaseComplete = jest.fn(async () => {});
    o.saveArtifact = jest.fn(async () => {});

    await (o.runAdvancedPlanningPhase as (r: string, opts: AnyObj) => Promise<void>)(
      runId, { projectId: "proj-1" }
    );

    expect(state.advancedPlan).toEqual(planContent);
  });
});
