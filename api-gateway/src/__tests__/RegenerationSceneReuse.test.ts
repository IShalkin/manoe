/**
 * Scene-level regeneration: with scenes_to_regenerate set, only listed scenes are
 * drafted; the rest are reused from the previous run (final_scene_N preferred, else
 * draft_scene_N). The draft seam is spied; no LLM calls.
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

type AnyObj = Record<string, unknown>;

function makeOrch(canned: Record<string, unknown>): { o: AnyObj; drafted: number[]; getCalls: string[] } {
  const orch = new StorytellerOrchestrator();
  const o = orch as unknown as AnyObj;
  const drafted: number[] = [];
  const getCalls: string[] = [];
  o.supabase = {
    getRunArtifact: jest.fn(async (_r: string, type: string) => {
      getCalls.push(type);
      return type in canned ? { content: canned[type] } : null;
    }),
    saveRunArtifact: jest.fn(async () => {}),
  };
  // Spy the per-scene drafting work so a "regenerate" scene records its number and
  // writes a draft; everything downstream (critique/revise/expand/polish/archivist)
  // is stubbed to no-op so the loop completes without LLM calls.
  o.draftScene = jest.fn(async (runId: string, _opt: AnyObj, sceneNum: number) => {
    drafted.push(sceneNum);
    ((o.activeRuns as Map<string, AnyObj>).get(runId)!.drafts as Map<number, AnyObj>).set(
      sceneNum, { sceneNum, content: `fresh ${sceneNum}`, wordCount: 2000 }
    );
  });
  o.draftSceneWithBeats = o.draftScene;
  o.expandScene = jest.fn(async () => {});
  o.critiqueScene = jest.fn(async () => ({ score: 9, approved: true }));
  o.isApproved = jest.fn(() => true);
  o.reviseScene = jest.fn(async () => {});
  o.runArchivistCheck = jest.fn(async () => {});
  o.polishScene = jest.fn(async () => {});
  o.shouldStop = jest.fn(() => false);
  o.publishEvent = jest.fn(async () => {});
  o.checkpointScene = jest.fn(async () => {});
  o.saveArtifact = jest.fn(async () => {});
  o.emitSceneFinal = jest.fn(async () => {});
  o.applySpicePass = jest.fn(async () => {});
  o.mirrorStatus = jest.fn(async () => {});
  return { o, drafted, getCalls };
}

function state(runId: string): AnyObj {
  return {
    runId, projectId: "p", phase: "drafting", characters: [],
    currentScene: 0, totalScenes: 3,
    outline: { scenes: [{ wordCount: 800 }, { wordCount: 800 }, { wordCount: 800 }] },
    drafts: new Map(), critiques: new Map(), revisionCount: new Map(),
    messages: [], maxRevisions: 2, keyConstraints: [], rawFactsLog: [],
    lastArchivistScene: 0, valueShifts: new Map(), spiceRegions: new Map(),
    rollingSynopsis: [], isPaused: false, isCompleted: false, startedAt: "", updatedAt: "",
  };
}

describe("runDraftingLoop scene-level regeneration", () => {
  it("drafts only listed scenes, reuses the rest from previous run (final preferred)", async () => {
    const canned = {
      final_scene_1: { sceneNum: 1, content: "kept final 1", wordCount: 1500 },
      final_scene_3: { sceneNum: 3, content: "kept final 3", wordCount: 1500 },
    };
    const { o, drafted, getCalls } = makeOrch(canned);
    const runId = "run-1";
    o.activeRuns = new Map([[runId, state(runId)]]);

    await (o.runDraftingLoop as (r: string, opt: AnyObj) => Promise<void>)(runId, {
      projectId: "p",
      previousRunId: "run-old",
      scenesToRegenerate: [2],
    });

    // Only scene 2 was drafted fresh.
    expect(drafted).toEqual([2]);
    // Scenes 1 and 3 were loaded from the prior run as final_scene_N.
    expect(getCalls).toContain("final_scene_1");
    expect(getCalls).toContain("final_scene_3");
    const drafts = (o.activeRuns as Map<string, AnyObj>).get(runId)!.drafts as Map<number, AnyObj>;
    expect((drafts.get(1) as AnyObj).content).toBe("kept final 1");
    expect((drafts.get(2) as AnyObj).content).toBe("fresh 2");
    expect((drafts.get(3) as AnyObj).content).toBe("kept final 3");
  });

  it("falls back to draft_scene_N when final_scene_N is absent", async () => {
    const canned = {
      draft_scene_1: { sceneNum: 1, content: "kept draft 1", wordCount: 1200 },
      final_scene_3: { sceneNum: 3, content: "kept final 3", wordCount: 1500 },
    };
    const { o, getCalls } = makeOrch(canned);
    const runId = "run-2";
    o.activeRuns = new Map([[runId, state(runId)]]);

    await (o.runDraftingLoop as (r: string, opt: AnyObj) => Promise<void>)(runId, {
      projectId: "p",
      previousRunId: "run-old",
      scenesToRegenerate: [2],
    });

    expect(getCalls).toContain("final_scene_1");
    expect(getCalls).toContain("draft_scene_1"); // fallback queried after final miss
    const drafts = (o.activeRuns as Map<string, AnyObj>).get(runId)!.drafts as Map<number, AnyObj>;
    expect((drafts.get(1) as AnyObj).content).toBe("kept draft 1");
  });

  it("BACKWARD COMPAT: no scenesToRegenerate drafts every scene", async () => {
    const { o, drafted } = makeOrch({});
    const runId = "run-3";
    o.activeRuns = new Map([[runId, state(runId)]]);
    await (o.runDraftingLoop as (r: string, opt: AnyObj) => Promise<void>)(runId, { projectId: "p" });
    expect(drafted).toEqual([1, 2, 3]);
  });
});
