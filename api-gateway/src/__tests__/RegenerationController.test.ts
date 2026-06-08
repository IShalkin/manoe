/**
 * Regeneration intake: the three regeneration fields the frontend already POSTs
 * (start_from_phase / previous_run_id / scenes_to_regenerate) must be parsed
 * snake_case and threaded into GenerationOptions, not silently dropped.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {} async flush() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { OrchestrationController } from "../controllers/OrchestrationController";
import { GenerationPhase } from "../models/LLMModels";
import { BadRequest } from "@tsed/exceptions";

type AnyObj = Record<string, unknown>;

function makeController(): { ctrl: OrchestrationController; captured: AnyObj[] } {
  const ctrl = new OrchestrationController();
  const c = ctrl as unknown as AnyObj;
  const captured: AnyObj[] = [];
  c.orchestrator = {
    startGeneration: jest.fn(async (opts: AnyObj) => { captured.push(opts); return "run-new"; }),
  };
  return { ctrl, captured };
}

const baseReq = {
  projectId: "proj-1",
  seedIdea: "a story",
  llmConfig: { provider: "openai", model: "gpt-5.5", apiKey: "k" },
  mode: "full" as const,
};

describe("OrchestrationController regeneration intake", () => {
  it("threads start_from_phase + previous_run_id + scenes_to_regenerate into options", async () => {
    const { ctrl, captured } = makeController();
    await ctrl.startGeneration({
      ...baseReq,
      start_from_phase: GenerationPhase.WORLDBUILDING,
      previous_run_id: "run-old",
      scenes_to_regenerate: [2, 4],
    } as never);
    expect(captured).toHaveLength(1);
    expect(captured[0].startFromPhase).toBe(GenerationPhase.WORLDBUILDING);
    expect(captured[0].previousRunId).toBe("run-old");
    expect(captured[0].scenesToRegenerate).toEqual([2, 4]);
  });

  it("leaves regeneration fields undefined for a plain request (backward compat)", async () => {
    const { ctrl, captured } = makeController();
    await ctrl.startGeneration({ ...baseReq } as never);
    expect(captured[0].startFromPhase).toBeUndefined();
    expect(captured[0].previousRunId).toBeUndefined();
    expect(captured[0].scenesToRegenerate).toBeUndefined();
  });
});

describe("OrchestrationController regeneration validation", () => {
  it("rejects an invalid start_from_phase with 400", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.startGeneration({ ...baseReq, start_from_phase: "not_a_phase", previous_run_id: "r" } as never)
    ).rejects.toBeInstanceOf(BadRequest);
  });

  it("rejects start_from_phase != genesis without previous_run_id", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.startGeneration({ ...baseReq, start_from_phase: GenerationPhase.OUTLINING } as never)
    ).rejects.toBeInstanceOf(BadRequest);
  });

  it("rejects scenes_to_regenerate without previous_run_id", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.startGeneration({ ...baseReq, scenes_to_regenerate: [1] } as never)
    ).rejects.toBeInstanceOf(BadRequest);
  });

  it("rejects scenes_to_regenerate that is empty or non-positive", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.startGeneration({ ...baseReq, scenes_to_regenerate: [], previous_run_id: "r" } as never)
    ).rejects.toBeInstanceOf(BadRequest);
    await expect(
      ctrl.startGeneration({ ...baseReq, scenes_to_regenerate: [0, -1], previous_run_id: "r" } as never)
    ).rejects.toBeInstanceOf(BadRequest);
  });

  it("accepts start_from_phase = genesis without previous_run_id", async () => {
    const { ctrl, captured } = makeController();
    await ctrl.startGeneration({ ...baseReq, start_from_phase: GenerationPhase.GENESIS } as never);
    expect(captured).toHaveLength(1);
  });
});
