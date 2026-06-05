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

  it("finalizes as flagged_subthreshold with undefined score when the final critique has no numeric score", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;
    const runId = "run-2";
    const state = makeState(runId, 1);
    o.activeRuns = new Map([[runId, state]]);

    o.draftScene = jest.fn(async (_r: string, _o: AnyObj, n: number) => {
      (state.drafts as Map<number, AnyObj>).set(n, { wordCount: 500, content: "x" });
    });
    o.draftSceneWithBeats = jest.fn(async () => {});
    o.expandScene = jest.fn(async () => {});
    // Never approves; final critique returns no usable numeric score.
    o.critiqueScene = jest.fn(async () => ({ revision_needed: true }));
    o.reviseScene = jest.fn(async () => {});
    o.polishScene = jest.fn(async () => {});
    o.runArchivistCheck = jest.fn(async () => {});
    o.publishEvent = jest.fn(async () => {});

    const finals: AnyObj[] = [];
    o.emitSceneFinal = jest.fn(async (_r: string, _p: string, n: number, status: string, score?: number) => {
      finals.push({ n, status, score });
    });

    await (o.runDraftingLoop as (r: string, opts: AnyObj) => Promise<void>)(runId, { projectId: "proj-1" });

    expect(finals).toHaveLength(1);
    expect(finals[0].status).toBe("flagged_subthreshold");
    expect(finals[0].score).toBeUndefined();
  });

  it("skips the final critique when the run is stopping", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;
    const runId = "run-3";
    const state = makeState(runId, 1);
    o.activeRuns = new Map([[runId, state]]);

    o.draftScene = jest.fn(async (_r: string, _o: AnyObj, n: number) => {
      (state.drafts as Map<number, AnyObj>).set(n, { wordCount: 500, content: "x" });
    });
    o.draftSceneWithBeats = jest.fn(async () => {});
    o.expandScene = jest.fn(async () => {});

    // shouldStop returns false during the revision loop (so it runs and exhausts),
    // then true afterward (so the FINAL critique is skipped).
    // The loop checks shouldStop multiple times; count critique calls to assert
    // no EXTRA final critique happens once stop is signalled.
    let critiqueCalls = 0;
    o.critiqueScene = jest.fn(async () => { critiqueCalls++; return { revision_needed: true, score: 5 }; });
    o.reviseScene = jest.fn(async () => {});
    o.polishScene = jest.fn(async () => {});
    o.runArchivistCheck = jest.fn(async () => {});
    o.publishEvent = jest.fn(async () => {});
    o.emitSceneFinal = jest.fn(async () => {});

    // shouldStop: false until the in-loop work is done, then true.
    // Return false for the first N calls (enough for the 2-revision loop), true after.
    // Call sequence for 1 scene, maxRevisions=2:
    //   call 1: top of for-loop
    //   call 2: after draftScene
    //   call 3: top of while (revision 0)
    //   call 4: after critiqueScene #1
    //   call 5: top of while (revision 1)
    //   call 6: after critiqueScene #2
    //   call 7: final critique guard — must return true to skip it
    let stopCalls = 0;
    o.shouldStop = jest.fn(() => { stopCalls++; return stopCalls > 6; });

    await (o.runDraftingLoop as (r: string, opts: AnyObj) => Promise<void>)(runId, { projectId: "proj-1" });

    // 2 in-loop critiques happened; the final critique must NOT have run (stop signalled).
    expect(critiqueCalls).toBe(2);
  });
});
