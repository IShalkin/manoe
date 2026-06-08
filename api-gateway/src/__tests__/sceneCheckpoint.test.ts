/**
 * Tests for scene-boundary state checkpointing (issue #157, Slice A).
 *
 * checkpointScene persists a full serialized GenerationState to Supabase at
 * each scene boundary so a hard crash loses at most the in-progress scene.
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
    projectId: "proj-check",
    phase: "drafting",
    currentScene: 3,
    totalScenes: 5,
    outline: { scenes: [] },
    characters: [],
    drafts: new Map([[1, { content: "Scene 1 text" }], [2, { content: "Scene 2 text" }]]),
    critiques: new Map([[1, [{ score: 8 }]]]),
    revisionCount: new Map([[1, 1]]),
    valueShifts: new Map([[1, 0.5]]),
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

function seedHeap(orch: StorytellerOrchestrator, runId: string, state: AnyObj) {
  const o = orch as unknown as AnyObj;
  (o.activeRuns as Map<string, AnyObj>).set(runId, state);
}

function injectFakeSupabase(orch: StorytellerOrchestrator, fake: {
  saveRunArtifact: jest.Mock;
}) {
  const o = orch as unknown as AnyObj;
  o.supabase = {
    ...(o.supabase as AnyObj ?? {}),
    saveRunArtifact: fake.saveRunArtifact,
  };
}

function callPrivate<T>(orch: StorytellerOrchestrator, method: string, ...args: unknown[]): T {
  const o = orch as unknown as AnyObj;
  return (o[method] as (...a: unknown[]) => T).call(orch, ...args);
}

describe("sceneCheckpoint – scene-boundary state persistence (issue #157 Slice A)", () => {
  it("calls saveRunArtifact with correct type, phase, and serialized content", async () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-chk";
    const state = makeState(runId);
    seedHeap(orch, runId, state);

    const mockSave = jest.fn().mockResolvedValue(undefined);
    injectFakeSupabase(orch, { saveRunArtifact: mockSave });

    await callPrivate(orch, "checkpointScene", runId, 3);

    expect(mockSave).toHaveBeenCalledTimes(1);
    const call = mockSave.mock.calls[0][0] as {
      runId: string;
      projectId: string;
      artifactType: string;
      phase: string;
      content: Record<string, unknown>;
    };

    expect(call.runId).toBe(runId);
    expect(call.projectId).toBe("proj-check");
    expect(call.artifactType).toBe("run_state_checkpoint");
    expect(call.phase).toBe("checkpoint_scene_3");

    // Maps must be serialized to plain objects in the content
    expect(typeof call.content.drafts).toBe("object");
    expect((call.content.drafts as AnyObj)[1]).toBeDefined();
    // Must NOT be a Map instance
    expect(call.content.drafts).not.toBeInstanceOf(Map);
    expect(call.content.critiques).not.toBeInstanceOf(Map);
  });

  it("does not throw when the run is absent from activeRuns", async () => {
    const orch = new StorytellerOrchestrator();
    const mockSave = jest.fn().mockResolvedValue(undefined);
    injectFakeSupabase(orch, { saveRunArtifact: mockSave });

    // Should resolve without throwing even though run is not in heap
    await expect(callPrivate(orch, "checkpointScene", "no-such-run", 1)).resolves.toBeUndefined();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("does not throw (logs warn) when saveRunArtifact rejects", async () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-chk-err";
    seedHeap(orch, runId, makeState(runId));

    const mockSave = jest.fn().mockRejectedValue(new Error("Supabase down"));
    injectFakeSupabase(orch, { saveRunArtifact: mockSave });

    await expect(callPrivate(orch, "checkpointScene", runId, 2)).resolves.toBeUndefined();
  });

  it("serializeState produces plain objects (not Maps) for all Map fields", () => {
    const orch = new StorytellerOrchestrator();
    const runId = "run-ser";
    const state = makeState(runId);
    seedHeap(orch, runId, state);

    const serialized = callPrivate<Record<string, unknown>>(orch, "serializeState", state);

    expect(serialized.drafts).not.toBeInstanceOf(Map);
    expect(serialized.critiques).not.toBeInstanceOf(Map);
    expect(serialized.revisionCount).not.toBeInstanceOf(Map);
    expect(serialized.valueShifts).not.toBeInstanceOf(Map);
    expect(serialized.spiceRegions).not.toBeInstanceOf(Map);

    // Values should be present
    expect((serialized.drafts as AnyObj)[1]).toBeDefined();
    expect((serialized.valueShifts as AnyObj)[1]).toBe(0.5);
  });
});
