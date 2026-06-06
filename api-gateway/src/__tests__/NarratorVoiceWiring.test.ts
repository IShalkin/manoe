/**
 * Slice 2: NARRATOR_DESIGN runs and persists state.narratorVoice so the Writer
 * and Critic can read it.
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

describe("runNarratorDesignPhase persists narratorVoice", () => {
  it("assigns the Profiler NARRATOR_DESIGN output to state.narratorVoice", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;
    const runId = "run-1";
    const state: AnyObj = { runId, projectId: "proj-1", narrative: { premise: "x" }, characters: [{ name: "Mara" }], updatedAt: "" };
    o.activeRuns = new Map([[runId, state]]);

    const voice = { voice: "wry", perspective: "3rd-limited", tone: "dry", style: "spare" };
    o.agentFactory = { getAgent: () => ({ execute: async () => ({ content: voice }) }) };
    o.publishPhaseStart = jest.fn(async () => {});
    o.publishPhaseComplete = jest.fn(async () => {});
    o.saveArtifact = jest.fn(async () => {});

    await (o.runNarratorDesignPhase as (r: string, opts: AnyObj) => Promise<void>)(runId, { projectId: "proj-1" });

    expect(state.narratorVoice).toEqual(voice);
  });
});
