/**
 * Tests the REAL StorytellerOrchestrator.runDraftingLoop Archivist scheduling.
 *
 * Bug: the Archivist only ran on scenes where (sceneNum % 3 === 0) with no
 * final flush, so when totalScenes is not a multiple of 3 the trailing scenes'
 * raw facts were never consolidated. The fix adds a final flush after the loop.
 *
 * We mock LangfuseService (its langfuse dependency does a dynamic import that
 * Jest's default VM cannot service) and stub the per-scene work methods, then
 * record which scenes runArchivistCheck is invoked for.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {}
    endTrace() {}
    startSpan() { return "span"; }
    endSpan() {}
    addEvent() {}
    trackLLMCall() {}
    async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {}
    recordRegenerationRequest() {}
  },
  AGENT_PROMPTS: {},
  PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;

function makeState(runId: string, sceneCount: number): AnyObj {
  const scenes = Array.from({ length: sceneCount }, (_, i) => ({ wordCount: 200, title: `Scene ${i + 1}` }));
  return {
    runId,
    projectId: "proj-1",
    phase: "drafting",
    currentScene: 0,
    totalScenes: sceneCount,
    outline: { scenes },
    characters: [],
    drafts: new Map(),
    critiques: new Map(),
    revisionCount: new Map(),
    messages: [],
    maxRevisions: 2,
    keyConstraints: [],
    rawFactsLog: [],
    lastArchivistScene: 0,
    isPaused: false,
    isCompleted: false,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Build an orchestrator with the scene-level work stubbed out, and capture the
 * scenes for which the Archivist runs. Returns { archivistScenes }.
 */
function runLoop(sceneCount: number): Promise<number[]> {
  const orch = new StorytellerOrchestrator();
  const runId = "run-1";
  const state = makeState(runId, sceneCount);
  const o = orch as unknown as AnyObj;
  o.activeRuns = new Map([[runId, state]]);

  const archivistScenes: number[] = [];

  // Stub per-scene work so the loop runs without real agents/LLM.
  o.draftScene = jest.fn(async (_r: string, _o: AnyObj, sceneNum: number) => {
    (state.drafts as Map<number, AnyObj>).set(sceneNum, { wordCount: 500, content: "x" });
  });
  o.draftSceneWithBeats = jest.fn(async (_r: string, _o: AnyObj, sceneNum: number) => {
    (state.drafts as Map<number, AnyObj>).set(sceneNum, { wordCount: 500, content: "x" });
  });
  o.expandScene = jest.fn(async () => {});
  // Critic approves immediately (revision_needed: false) → no revision loop.
  o.critiqueScene = jest.fn(async () => ({ revision_needed: false, score: 9 }));
  o.reviseScene = jest.fn(async () => {});
  o.polishScene = jest.fn(async () => {});
  o.emitSceneFinal = jest.fn(async () => {});
  o.publishEvent = jest.fn(async () => {});
  // Record archivist coverage instead of doing real consolidation.
  o.runArchivistCheck = jest.fn(async (_r: string, _o: AnyObj, upToScene: number) => {
    archivistScenes.push(upToScene);
  });

  return (o.runDraftingLoop as (r: string, opts: AnyObj) => Promise<void>)(runId, {
    projectId: "proj-1",
  }).then(() => archivistScenes);
}

describe("StorytellerOrchestrator Archivist scheduling", () => {
  it("covers the final scene when totalScenes is NOT a multiple of 3 (8 scenes)", async () => {
    const scenes = await runLoop(8);
    // Periodic runs at 3 and 6, then a final flush covering scene 8.
    expect(scenes).toContain(8);
    expect(Math.max(...scenes)).toBe(8);
  });

  it("covers the final scene for 5 scenes (periodic at 3, flush at 5)", async () => {
    const scenes = await runLoop(5);
    expect(scenes).toContain(5);
    expect(Math.max(...scenes)).toBe(5);
  });

  it("does not double-run the Archivist when totalScenes IS a multiple of 3 (6 scenes)", async () => {
    const scenes = await runLoop(6);
    // Periodic run at 3 and 6; the final flush must not re-run scene 6.
    expect(scenes).toEqual([3, 6]);
  });

  it("still flushes a short run shorter than the period (2 scenes)", async () => {
    const scenes = await runLoop(2);
    expect(scenes).toEqual([2]);
  });
});
