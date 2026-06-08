/**
 * Phase-based regeneration: runGeneration seeds prior-run artifacts then skips
 * phases before start_from_phase. Backward-compat: no regen fields -> all phases run.
 * The per-phase methods are replaced with spies; no agents/LLMs are invoked.
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

const PHASE_METHODS = [
  "runGenesisPhase",
  "runCharactersPhase",
  "runNarratorDesignPhase",
  "runWorldbuildingPhase",
  "runOutliningPhase",
  "runAdvancedPlanningPhase",
  "runDraftingLoop",
] as const;

function makeOrch(): { o: AnyObj; ran: string[] } {
  const orch = new StorytellerOrchestrator();
  const o = orch as unknown as AnyObj;
  const ran: string[] = [];
  for (const m of PHASE_METHODS) {
    o[m] = jest.fn(async () => { ran.push(m); });
  }
  o.shouldStop = jest.fn(() => false);
  o.publishEvent = jest.fn(async () => {});
  o.mirrorStatus = jest.fn(async () => {});
  o.persistRunConfig = jest.fn(async () => {});
  o.handleError = jest.fn(async () => {});
  o.langfuse = { endTrace: jest.fn() };
  o.seedStateFromPreviousRun = jest.fn(async () => {});
  return { o, ran };
}

function state(runId: string): AnyObj {
  return {
    runId, projectId: "p", phase: GenerationPhase.GENESIS, characters: [],
    currentScene: 0, totalScenes: 0, drafts: new Map(), critiques: new Map(),
    revisionCount: new Map(), messages: [], maxRevisions: 2, keyConstraints: [],
    rawFactsLog: [], lastArchivistScene: 0, valueShifts: new Map(),
    spiceRegions: new Map(), rollingSynopsis: [], isPaused: false, isCompleted: false,
    startedAt: "", updatedAt: "",
  };
}

describe("runGeneration phase skip", () => {
  it("BACKWARD COMPAT: no regen fields runs all seven phase steps in order", async () => {
    const { o, ran } = makeOrch();
    const runId = "run-1";
    o.activeRuns = new Map([[runId, state(runId)]]);
    await (o.runGeneration as (r: string, opt: AnyObj) => Promise<void>)(runId, { projectId: "p" });
    expect(ran).toEqual([...PHASE_METHODS]);
    expect(o.seedStateFromPreviousRun).not.toHaveBeenCalled();
  });

  it("start_from_phase = OUTLINING seeds prior run and runs only outlining onward", async () => {
    const { o, ran } = makeOrch();
    const runId = "run-2";
    o.activeRuns = new Map([[runId, state(runId)]]);
    await (o.runGeneration as (r: string, opt: AnyObj) => Promise<void>)(runId, {
      projectId: "p",
      startFromPhase: GenerationPhase.OUTLINING,
      previousRunId: "run-old",
    });
    // outlining index 4 -> run indices 4,5,6
    expect(ran).toEqual(["runOutliningPhase", "runAdvancedPlanningPhase", "runDraftingLoop"]);
    expect(o.seedStateFromPreviousRun).toHaveBeenCalledTimes(1);
    expect((o.seedStateFromPreviousRun as jest.Mock).mock.calls[0][1]).toBe("run-old");
    expect((o.seedStateFromPreviousRun as jest.Mock).mock.calls[0][2]).toBe(4);
  });

  it("start_from_phase = DRAFTING runs only the drafting loop", async () => {
    const { o, ran } = makeOrch();
    const runId = "run-3";
    o.activeRuns = new Map([[runId, state(runId)]]);
    await (o.runGeneration as (r: string, opt: AnyObj) => Promise<void>)(runId, {
      projectId: "p",
      startFromPhase: GenerationPhase.DRAFTING,
      previousRunId: "run-old",
    });
    expect(ran).toEqual(["runDraftingLoop"]);
  });
});
