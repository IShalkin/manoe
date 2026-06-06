/**
 * Slice 2 (integration-review fix): the valueShifts Map must survive the
 * snapshot → restore round-trip like the other GenerationState Maps. Before the
 * fix, gracefulShutdown's serializer and restoreFromShutdown's rehydration
 * handled drafts/critiques/revisionCount but NOT valueShifts, so a run resumed
 * after a server restart had valueShifts as a plain object {} and crashed at the
 * first `state.valueShifts.set(...)` in runDraftingLoop. This guards the seam.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {}
    async flush() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;

function makeOrch(): { orch: StorytellerOrchestrator; o: AnyObj; saved: AnyObj[] } {
  const orch = new StorytellerOrchestrator();
  const o = orch as unknown as AnyObj;
  const saved: AnyObj[] = [];
  // Capture what gets serialized to Supabase on shutdown, and replay it on restore.
  o.supabase = {
    saveRunArtifact: jest.fn(async (a: AnyObj) => { saved.push(a); }),
    getRunArtifact: jest.fn(async () => (saved.length ? { content: saved[saved.length - 1].content } : null)),
  };
  o.publishEvent = jest.fn(async () => {});
  o.langfuse = { flush: jest.fn(async () => {}) };
  return { orch, o, saved };
}

function makeState(runId: string): AnyObj {
  return {
    runId, projectId: "proj-1", phase: "drafting", currentScene: 2, totalScenes: 3,
    outline: { scenes: [{}, {}, {}] }, characters: [], drafts: new Map(), critiques: new Map(),
    revisionCount: new Map(), messages: [], maxRevisions: 2, keyConstraints: [],
    rawFactsLog: [], lastArchivistScene: 0, isPaused: false, isCompleted: false,
    inFlight: false, rollingSynopsis: [{ sceneNumber: 1, summary: "Scene 1 recap." }],
    valueShifts: new Map<number, number>([[1, -2], [2, 4]]),
    spiceRegions: new Map<number, { text: string; style: string }[]>([[2, [{ text: "frag", style: "x" }]]]),
    startedAt: "", updatedAt: "",
  };
}

describe("valueShifts survives snapshot → restore", () => {
  it("serializes valueShifts on shutdown and rehydrates it as a Map on restore", async () => {
    const { orch, o, saved } = makeOrch();
    const runId = "run-1";
    o.activeRuns = new Map([[runId, makeState(runId)]]);

    // 1. Snapshot. The serialized content must carry valueShifts as a plain
    //    object (JSON.stringify turns a Map into {} — so it must be pre-converted).
    await (o.gracefulShutdown as (timeoutMs: number) => Promise<number>)(0);
    expect(saved).toHaveLength(1);
    const content = saved[0].content as AnyObj;
    // Round-trip through JSON to simulate the Supabase store faithfully.
    const persisted = JSON.parse(JSON.stringify(content)) as AnyObj;
    expect(persisted.valueShifts).toEqual({ "1": -2, "2": 4 });

    // 2. Restore from the persisted snapshot.
    o.supabase = { getRunArtifact: jest.fn(async () => ({ content: persisted })) };
    o.activeRuns = new Map();
    const restored = await (o.restoreFromShutdown as (r: string) => Promise<number>)(runId);
    expect(restored).toBe(1);

    // 3. The rehydrated state must have a real Map (numeric keys), not a plain object.
    const state = (o.activeRuns as Map<string, AnyObj>).get(runId)!;
    expect(state.valueShifts instanceof Map).toBe(true);
    const vs = state.valueShifts as Map<number, number>;
    expect(vs.get(1)).toBe(-2);
    expect(vs.get(2)).toBe(4);
    // The write that used to crash must now work.
    expect(() => vs.set(3, 1)).not.toThrow();
  });

  it("serializes spiceRegions on shutdown and rehydrates it as a Map on restore", async () => {
    const { orch, o, saved } = makeOrch();
    const runId = "run-1";
    o.activeRuns = new Map([[runId, makeState(runId)]]);

    await (o.gracefulShutdown as (timeoutMs: number) => Promise<number>)(0);
    expect(saved).toHaveLength(1);
    const content = saved[0].content as AnyObj;
    const persisted = JSON.parse(JSON.stringify(content)) as AnyObj;
    expect(persisted.spiceRegions).toEqual({ "2": [{ text: "frag", style: "x" }] });

    o.supabase = { getRunArtifact: jest.fn(async () => ({ content: persisted })) };
    o.activeRuns = new Map();
    const restored = await (o.restoreFromShutdown as (r: string) => Promise<number>)(runId);
    expect(restored).toBe(1);

    const state = (o.activeRuns as Map<string, AnyObj>).get(runId)!;
    expect(state.spiceRegions instanceof Map).toBe(true);
    const sr = state.spiceRegions as Map<number, { text: string; style: string }[]>;
    expect(sr.get(2)).toEqual([{ text: "frag", style: "x" }]);
    // The write that used to crash must now work.
    expect(() => sr.set(3, [{ text: "more", style: "y" }])).not.toThrow();
  });

  it("defaults rollingSynopsis to [] when restoring a pre-field snapshot", async () => {
    const { orch, o, saved } = makeOrch();
    const runId = "run-1";
    o.activeRuns = new Map([[runId, makeState(runId)]]);

    await (o.gracefulShutdown as (timeoutMs: number) => Promise<number>)(0);
    const content = saved[0].content as AnyObj;
    const persisted = JSON.parse(JSON.stringify(content)) as AnyObj;
    // Simulate an OLD snapshot saved before rollingSynopsis existed: the key is absent.
    delete persisted.rollingSynopsis;

    o.supabase = { getRunArtifact: jest.fn(async () => ({ content: persisted })) };
    o.activeRuns = new Map();
    const restored = await (o.restoreFromShutdown as (r: string) => Promise<number>)(runId);
    expect(restored).toBe(1);

    const state = (o.activeRuns as Map<string, AnyObj>).get(runId)!;
    expect(Array.isArray(state.rollingSynopsis)).toBe(true);
    // The .push() that used to crash (undefined) must now work.
    expect(() =>
      (state.rollingSynopsis as { sceneNumber: number; summary: string }[]).push({ sceneNumber: 2, summary: "x" })
    ).not.toThrow();
  });
});
