/**
 * seedStateFromPreviousRun loads a prior run's artifacts for every phase BEFORE
 * start_from_phase and populates GenerationState. Pure helpers resolveStartPhaseIndex
 * and scenesToRun are unit-tested in isolation. No LLM calls.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {} async flush() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";
import { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

function makeOrch(canned: Record<string, unknown>): { o: AnyObj; calls: string[] } {
  const orch = new StorytellerOrchestrator();
  const o = orch as unknown as AnyObj;
  const calls: string[] = [];
  o.supabase = {
    // getRunArtifact returns the full row { content }, or null when absent.
    getRunArtifact: jest.fn(async (_runId: string, artifactType: string) => {
      calls.push(artifactType);
      return artifactType in canned ? { content: canned[artifactType] } : null;
    }),
  };
  return { o, calls };
}

function emptyState(runId: string): AnyObj {
  return {
    runId, projectId: "proj-1", phase: "genesis", characters: [],
    currentScene: 0, totalScenes: 0, drafts: new Map(), critiques: new Map(),
    revisionCount: new Map(), messages: [], maxRevisions: 2, keyConstraints: [],
    rawFactsLog: [], lastArchivistScene: 0, valueShifts: new Map(),
    spiceRegions: new Map(), rollingSynopsis: [], isPaused: false, isCompleted: false,
    startedAt: "", updatedAt: "",
  };
}

describe("resolveStartPhaseIndex (pure)", () => {
  it("returns 0 for undefined (full run)", () => {
    const o = (new StorytellerOrchestrator()) as unknown as AnyObj;
    expect((o.resolveStartPhaseIndex as (p?: GenerationPhase) => number)(undefined)).toBe(0);
  });
  it("returns 0 for genesis", () => {
    const o = (new StorytellerOrchestrator()) as unknown as AnyObj;
    expect((o.resolveStartPhaseIndex as (p?: GenerationPhase) => number)(GenerationPhase.GENESIS)).toBe(0);
  });
  it("maps a mid-chain phase to its index, and in-loop phases to the drafting index", () => {
    const o = (new StorytellerOrchestrator()) as unknown as AnyObj;
    const f = o.resolveStartPhaseIndex as (p?: GenerationPhase) => number;
    expect(f(GenerationPhase.WORLDBUILDING)).toBe(3);
    expect(f(GenerationPhase.OUTLINING)).toBe(4);
    // critique/revision/originality/impact/polish all fold into the drafting loop:
    expect(f(GenerationPhase.CRITIQUE)).toBe(6);
    expect(f(GenerationPhase.POLISH)).toBe(6);
  });
});

describe("scenesToRun (pure)", () => {
  it("returns all 1-indexed scene numbers when regenerate list absent", () => {
    const o = (new StorytellerOrchestrator()) as unknown as AnyObj;
    const f = o.scenesToRun as (count: number, regen?: number[]) => { sceneNum: number; regenerate: boolean }[];
    expect(f(3, undefined)).toEqual([
      { sceneNum: 1, regenerate: true },
      { sceneNum: 2, regenerate: true },
      { sceneNum: 3, regenerate: true },
    ]);
  });
  it("marks only listed scenes for regeneration, rest reuse", () => {
    const o = (new StorytellerOrchestrator()) as unknown as AnyObj;
    const f = o.scenesToRun as (count: number, regen?: number[]) => { sceneNum: number; regenerate: boolean }[];
    expect(f(3, [2])).toEqual([
      { sceneNum: 1, regenerate: false },
      { sceneNum: 2, regenerate: true },
      { sceneNum: 3, regenerate: false },
    ]);
  });
});

describe("seedStateFromPreviousRun", () => {
  it("loads artifacts for exactly the phases before start_from_phase and populates state", async () => {
    const canned = {
      narrative: { logline: "L" },
      characters: [{ name: "A" }],
      narrator_voice: { pov: "first" },
      worldbuilding: { setting: "W" },
    };
    const { o, calls } = makeOrch(canned);
    const state = emptyState("run-new");
    // start_from_phase = OUTLINING (index 4) -> seed genesis..worldbuilding (indices 0-3)
    // Phases strictly before OUTLINING: genesis, characters, narrator_design, worldbuilding.
    await (o.seedStateFromPreviousRun as (s: AnyObj, prev: string, upto: number) => Promise<void>)(
      state, "run-old", (o.resolveStartPhaseIndex as (p?: GenerationPhase) => number)(GenerationPhase.OUTLINING)
    );
    // Called for exactly the four phases before outlining (in order).
    expect(calls).toEqual(["narrative", "characters", "narrator_voice", "worldbuilding"]);
    expect(state.narrative).toEqual({ logline: "L" });
    expect(state.characters).toEqual([{ name: "A" }]);
    expect(state.narratorVoice).toEqual({ pov: "first" });
    expect(state.worldbuilding).toEqual({ setting: "W" });
    // Phases at/after start are NOT seeded.
    expect(state.outline).toBeUndefined();
    expect(state.advancedPlan).toBeUndefined();
  });

  it("tolerates a missing prior artifact (warns, leaves field unset)", async () => {
    const { o, calls } = makeOrch({ narrative: { logline: "L" } }); // characters absent
    const state = emptyState("run-new");
    await (o.seedStateFromPreviousRun as (s: AnyObj, prev: string, upto: number) => Promise<void>)(
      state, "run-old", (o.resolveStartPhaseIndex as (p?: GenerationPhase) => number)(GenerationPhase.NARRATOR_DESIGN)
    );
    expect(calls).toEqual(["narrative", "characters"]);
    expect(state.narrative).toEqual({ logline: "L" });
    expect(state.characters).toEqual([]); // unchanged default, no crash
  });
});
