/**
 * Slice 2: after each scene the loop appends a rolling-synopsis entry and
 * records the Critic's achieved value-shift, so scene N+1 enters with N's exit.
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

function makeState(runId: string, sceneCount: number): AnyObj {
  const scenes = Array.from({ length: sceneCount }, (_, i) => ({ wordCount: 200, title: `Scene ${i + 1}`, goal: "g", conflict: "c", hook: "h" }));
  return {
    runId, projectId: "proj-1", phase: "drafting", currentScene: 0, totalScenes: sceneCount,
    outline: { scenes }, characters: [], drafts: new Map(), critiques: new Map(),
    revisionCount: new Map(), messages: [], maxRevisions: 2, keyConstraints: [],
    rawFactsLog: [], lastArchivistScene: 0, isPaused: false, isCompleted: false,
    rollingSynopsis: [], valueShifts: new Map(), startedAt: "", updatedAt: "",
  };
}

describe("runDraftingLoop synopsis + value-shift threading", () => {
  it("appends a synopsis entry and records the value-shift per scene", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;
    const runId = "run-1";
    const state = makeState(runId, 2);
    o.activeRuns = new Map([[runId, state]]);

    o.draftScene = jest.fn(async (_r: string, _o: AnyObj, n: number) => {
      (state.drafts as Map<number, AnyObj>).set(n, { wordCount: 500, content: `scene ${n} text` });
    });
    o.draftSceneWithBeats = jest.fn(async () => {});
    o.expandScene = jest.fn(async () => {});
    o.critiqueScene = jest.fn(async (_r: string, _o: AnyObj, n: number) => ({ approved: true, score: 8, valueShiftDelivered: n === 1 ? -2 : 4 }));
    o.reviseScene = jest.fn(async () => {});
    o.polishScene = jest.fn(async () => {});
    o.runArchivistCheck = jest.fn(async () => {});
    o.publishEvent = jest.fn(async () => {});
    o.emitSceneFinal = jest.fn(async () => {});
    o.agentFactory = { getAgent: () => ({ summarizeScene: async (_r: string, _o: AnyObj, n: number) => `summary of scene ${n}` }) };

    await (o.runDraftingLoop as (r: string, opts: AnyObj) => Promise<void>)(runId, { projectId: "proj-1" });

    const synopsis = state.rollingSynopsis as { sceneNumber: number; summary: string }[];
    expect(synopsis).toHaveLength(2);
    expect(synopsis[0]).toEqual({ sceneNumber: 1, summary: "summary of scene 1" });
    const vs = state.valueShifts as Map<number, number>;
    expect(vs.get(1)).toBe(-2);
    expect(vs.get(2)).toBe(4);
  });
});
