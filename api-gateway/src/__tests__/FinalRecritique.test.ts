/**
 * Slice 1a: when a scene exhausts revisions without approval, the loop must
 * run one final score-only critique and finalize with a "flagged_subthreshold"
 * status carrying the score — not silently accept it.
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
  const scenes = Array.from({ length: sceneCount }, (_, i) => ({ wordCount: 200, title: `Scene ${i + 1}` }));
  return {
    runId, projectId: "proj-1", phase: "drafting", currentScene: 0, totalScenes: sceneCount,
    outline: { scenes }, characters: [], drafts: new Map(), critiques: new Map(),
    revisionCount: new Map(), messages: [], maxRevisions: 2, keyConstraints: [],
    rawFactsLog: [], lastArchivistScene: 0, isPaused: false, isCompleted: false,
    startedAt: "", updatedAt: "",
  };
}

describe("runDraftingLoop final re-critique", () => {
  it("runs a final critique and flags a never-approved scene with its score", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;
    const runId = "run-1";
    const state = makeState(runId, 1);
    o.activeRuns = new Map([[runId, state]]);

    let critiqueCalls = 0;
    o.draftScene = jest.fn(async (_r: string, _o: AnyObj, n: number) => {
      (state.drafts as Map<number, AnyObj>).set(n, { wordCount: 500, content: "x" });
    });
    o.draftSceneWithBeats = jest.fn(async () => {});
    o.expandScene = jest.fn(async () => {});
    // Critic never approves (always low score).
    o.critiqueScene = jest.fn(async () => { critiqueCalls++; return { revision_needed: true, score: 5 }; });
    o.reviseScene = jest.fn(async () => {});
    o.polishScene = jest.fn(async () => {});
    o.runArchivistCheck = jest.fn(async () => {});
    o.publishEvent = jest.fn(async () => {});

    const finals: AnyObj[] = [];
    o.emitSceneFinal = jest.fn(async (_r: string, _p: string, n: number, status: string, score?: number) => {
      finals.push({ n, status, score });
    });

    await (o.runDraftingLoop as (r: string, opts: AnyObj) => Promise<void>)(runId, { projectId: "proj-1" });

    // 2 in-loop critiques (maxRevisions=2) + 1 final score-only critique = 3.
    expect(critiqueCalls).toBe(3);
    expect(finals).toHaveLength(1);
    expect(finals[0].status).toBe("flagged_subthreshold");
    expect(finals[0].score).toBe(5);
  });
});
