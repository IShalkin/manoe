/**
 * Regression test for the Slice 2 terminal spice pass resilience contract.
 *
 * applySpicePass is an OPTIONAL, uncensored-model enhancement that runs AFTER a
 * scene is already finalized in SOFT form. Its contract is: it must NEVER fail a
 * scene. A failure in any of its side-effecting calls (notably the Redis-backed
 * publishEvent calls, which are not internally guarded) must be swallowed so the
 * already-finalized SOFT canon survives and the run is not marked ERROR.
 *
 * This test injects a redisStreams mock whose publishEvent throws, then asserts
 * that applySpicePass RESOLVES (does not reject) and the soft draft.content is
 * left untouched.
 */

// The third-party `langfuse` package does a dynamic import() at module-eval time,
// which Jest's default VM cannot service. Mock our LangfuseService wrapper so the
// real langfuse package is never required and the orchestrator loads. (Mirrors
// the pattern in OrchestratorImport.test.ts.)
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

describe("applySpicePass resilience", () => {
  const SOFT_TEXT = "She crossed the room. The fragment was here. Then she left.";

  function buildOrchestrator(publishEvent: jest.Mock) {
    // Field-injected (@Inject) deps — assign the few applySpicePass touches.
    const orchestrator = new StorytellerOrchestrator();

    const llmProvider = {
      createCompletionWithRetry: jest
        .fn()
        .mockResolvedValue({ content: "She crossed the room, slower this time." }),
    };
    const redisStreams = { publishEvent };
    const supabase = { saveRunArtifact: jest.fn().mockResolvedValue(undefined) };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (orchestrator as any).llmProvider = llmProvider;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (orchestrator as any).redisStreams = redisStreams;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (orchestrator as any).supabase = supabase;

    return { orchestrator, llmProvider, redisStreams, supabase };
  }

  function seedRun(orchestrator: StorytellerOrchestrator, runId: string, sceneNum: number) {
    const draft: Record<string, unknown> = { content: SOFT_TEXT, wordCount: 12 };
    const drafts = new Map<number, unknown>([[sceneNum, draft]]);
    const spiceRegions = new Map<number, unknown[]>([
      [sceneNum, [{ text: "The fragment was here.", style: "sensual" }]],
    ]);

    const state = {
      runId,
      drafts,
      spiceRegions,
      updatedAt: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (orchestrator as any).activeRuns.set(runId, state);
    return { draft, state };
  }

  const options = {
    projectId: "proj-1",
    spiceConfig: {
      provider: "openrouter",
      model: "uncensored-model",
      apiKey: "test-key",
      ceiling: "explicit",
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it("swallows a publishEvent (Redis) failure and keeps the soft text", async () => {
    const publishEvent = jest.fn().mockRejectedValue(new Error("Redis hiccup"));
    const { orchestrator } = buildOrchestrator(publishEvent);
    const runId = "run-redis-fail";
    const sceneNum = 1;
    const { draft } = seedRun(orchestrator, runId, sceneNum);

    // Call the private method via cast — must resolve, not reject.
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (orchestrator as any).applySpicePass(runId, options, sceneNum)
    ).resolves.toBeUndefined();

    // The very first publishEvent (scene_spice_start) threw — proves the throw path was hit.
    expect(publishEvent).toHaveBeenCalled();
    // Soft canon is intact; the pass did not corrupt the finalized draft.
    expect(draft.content).toBe(SOFT_TEXT);
  });

  it("does not reject when publish succeeds on the success branch", async () => {
    const publishEvent = jest.fn().mockResolvedValue(undefined);
    const { orchestrator } = buildOrchestrator(publishEvent);
    const runId = "run-ok";
    const sceneNum = 2;
    const { draft } = seedRun(orchestrator, runId, sceneNum);

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (orchestrator as any).applySpicePass(runId, options, sceneNum)
    ).resolves.toBeUndefined();

    // Soft content is preserved; amplification is stored separately under spicedContent.
    expect(draft.content).toBe(SOFT_TEXT);
  });
});
