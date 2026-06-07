/**
 * Tests for the cross-instance getRunStatus fallback (issue #157, Slice A).
 *
 * When a run is NOT in this instance's activeRuns (i.e., it lives on another
 * replica), getRunStatus must fall back to the Redis mirror so status/SSE
 * requests return 200 instead of 404.
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
import type { RunStatusMirror } from "../services/RedisStreamsService";
import type { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

/** Minimal GenerationState shape for seeding activeRuns */
function makeHeapState(runId: string): AnyObj {
  return {
    runId,
    projectId: "proj-heap",
    phase: "drafting",
    currentScene: 2,
    totalScenes: 5,
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
    startedAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:01:00.000Z",
  };
}

function seedHeap(orch: StorytellerOrchestrator, runId: string, state: AnyObj) {
  const o = orch as unknown as AnyObj;
  (o.activeRuns as Map<string, AnyObj>).set(runId, state);
}

function injectFakeRedis(orch: StorytellerOrchestrator, fake: Partial<{
  getRunStatusMirror: jest.Mock;
  setRunStatus: jest.Mock;
}>) {
  const o = orch as unknown as AnyObj;
  // Merge with whatever DI wired (which may be undefined in unit tests)
  o.redisStreams = {
    ...(o.redisStreams as AnyObj ?? {}),
    getRunStatusMirror: jest.fn(),
    setRunStatus: jest.fn().mockResolvedValue(undefined),
    publishEvent: jest.fn().mockResolvedValue("id"),
    ...fake,
  };
}

const mirrorRecord: RunStatusMirror = {
  runId: "run-mirror",
  projectId: "proj-mirror",
  phase: "critique",
  currentScene: 3,
  totalScenes: 6,
  isPaused: false,
  isCompleted: false,
  startedAt: "2026-06-07T09:00:00.000Z",
  updatedAt: "2026-06-07T09:30:00.000Z",
};

describe("getRunStatus – cross-instance Redis fallback (issue #157 Slice A)", () => {
  it("returns heap status when run is in activeRuns; does NOT call getRunStatusMirror", async () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-heap";
    const state = makeHeapState(runId);
    seedHeap(orch, runId, state);

    const mockMirror = jest.fn();
    injectFakeRedis(orch, { getRunStatusMirror: mockMirror });

    const result = await orch.getRunStatus(runId);

    expect(result).not.toBeNull();
    expect(result!.runId).toBe(runId);
    expect(result!.projectId).toBe("proj-heap");
    expect(result!.phase).toBe("drafting" as GenerationPhase);
    // Heap is authoritative — mirror should NOT be consulted
    expect(mockMirror).not.toHaveBeenCalled();
  });

  it("returns mirrored status when run is absent from heap (cross-replica live run)", async () => {
    const orch = new StorytellerOrchestrator();
    // Do NOT seed activeRuns

    injectFakeRedis(orch, {
      getRunStatusMirror: jest.fn().mockResolvedValue(mirrorRecord),
    });

    const result = await orch.getRunStatus("run-mirror");

    expect(result).not.toBeNull();
    expect(result!.runId).toBe("run-mirror");
    expect(result!.projectId).toBe("proj-mirror");
    expect(result!.phase).toBe("critique" as GenerationPhase);
    expect(result!.currentScene).toBe(3);
    expect(result!.totalScenes).toBe(6);
    expect(result!.isPaused).toBe(false);
    expect(result!.isCompleted).toBe(false);
  });

  it("returns null when run is absent from heap AND mirror returns null", async () => {
    const orch = new StorytellerOrchestrator();

    injectFakeRedis(orch, {
      getRunStatusMirror: jest.fn().mockResolvedValue(null),
    });

    const result = await orch.getRunStatus("no-such-run");
    expect(result).toBeNull();
  });

  it("returns null (does not throw) when mirror throws", async () => {
    const orch = new StorytellerOrchestrator();

    injectFakeRedis(orch, {
      getRunStatusMirror: jest.fn().mockRejectedValue(new Error("Redis connection failed")),
    });

    await expect(orch.getRunStatus("run-err")).resolves.toBeNull();
  });
});
