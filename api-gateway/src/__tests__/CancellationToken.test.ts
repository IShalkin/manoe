/**
 * Tests the REAL StorytellerOrchestrator cooperative cancellation + graceful
 * shutdown checkpoint behavior.
 *
 * Bugs being fixed:
 *  1. cancelRun(runId) used to set state.error then IMMEDIATELY delete the run
 *     from activeRuns. In-flight work that re-read activeRuns.get(runId) then
 *     saw `undefined` and silently returned, while getRunStatus(runId) returned
 *     null. Cancellation should instead be observed cooperatively: the state
 *     stays retrievable, getRunStatus reflects the error, and shouldStop returns
 *     true at the next boundary.
 *  2. gracefulShutdown's "wait for safe checkpoint" loop only checked
 *     state.isPaused, which it set itself two lines earlier — so it never waited
 *     for in-flight LLM work. It must wait on an in-flight flag with the timeout
 *     as a backstop.
 *
 * We mock LangfuseService (its langfuse dependency does a dynamic import that
 * Jest's default VM cannot service).
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
    async flush() {}
    scoreTrace() {}
  },
  AGENT_PROMPTS: {},
  PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;

function makeState(runId: string): AnyObj {
  return {
    runId,
    projectId: "proj-1",
    phase: "drafting",
    currentScene: 0,
    totalScenes: 3,
    outline: { scenes: [] },
    characters: [],
    drafts: new Map(),
    critiques: new Map(),
    revisionCount: new Map(),
    valueShifts: new Map(),
    spiceRegions: new Map(),
    rollingSynopsis: [],
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

function seed(orch: StorytellerOrchestrator, runId: string, state: AnyObj) {
  const o = orch as unknown as AnyObj;
  (o.activeRuns as Map<string, AnyObj>).set(runId, state);
}

describe("StorytellerOrchestrator cooperative cancellation", () => {
  it("cancelRun marks the run cancelled cooperatively without deleting it", async () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-cancel";
    const state = makeState(runId);
    seed(orch, runId, state);

    const result = orch.cancelRun(runId);
    expect(result).toBe(true);

    // shouldStop observes the cancellation at the next boundary.
    const shouldStop = (orch as unknown as AnyObj).shouldStop as (r: string) => boolean;
    expect(shouldStop.call(orch, runId)).toBe(true);

    // The state must STILL be retrievable (not immediately deleted) so in-flight
    // code that re-reads activeRuns sees a coherent cancelled state.
    const status = await orch.getRunStatus(runId);
    expect(status).not.toBeNull();
    expect(status!.error).toBeTruthy();
  });

  it("cancelRun on an unknown runId returns false", () => {
    const orch = new StorytellerOrchestrator();
    expect(orch.cancelRun("does-not-exist")).toBe(false);
  });

  it("happy-path run (not cancelled, not paused) does not stop", () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-ok";
    seed(orch, runId, makeState(runId));
    const shouldStop = (orch as unknown as AnyObj).shouldStop as (r: string) => boolean;
    expect(shouldStop.call(orch, runId)).toBe(false);
  });
});

describe("StorytellerOrchestrator gracefulShutdown checkpoint wait", () => {
  it("does NOT treat an in-flight run as instantly safe; waits via timeout backstop", async () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-inflight";
    const state = makeState(runId);
    state.inFlight = true; // simulate mid-LLM-call
    seed(orch, runId, state);

    // Stub side-effecting deps so shutdown runs offline.
    const o = orch as unknown as AnyObj;
    o.publishEvent = jest.fn(async () => {});
    o.supabase = { saveRunArtifact: jest.fn(async () => {}) };
    o.langfuse = { flush: jest.fn(async () => {}) };

    const start = Date.now();
    const saved = await orch.gracefulShutdown(200);
    const elapsed = Date.now() - start;

    // Because the run stayed inFlight, the loop must have used the full timeout
    // backstop rather than bailing on the first iteration.
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(saved).toBe(1);
  });

  it("returns promptly once in-flight runs reach a safe checkpoint", async () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-flips";
    const state = makeState(runId);
    state.inFlight = true;
    seed(orch, runId, state);

    const o = orch as unknown as AnyObj;
    o.publishEvent = jest.fn(async () => {});
    o.supabase = { saveRunArtifact: jest.fn(async () => {}) };
    o.langfuse = { flush: jest.fn(async () => {}) };

    // Flip to safe checkpoint shortly after shutdown begins.
    setTimeout(() => { state.inFlight = false; }, 50);

    const start = Date.now();
    const saved = await orch.gracefulShutdown(5000);
    const elapsed = Date.now() - start;

    // Should return well before the 5s timeout once the run is safe.
    expect(elapsed).toBeLessThan(2000);
    expect(saved).toBe(1);
  });
});
