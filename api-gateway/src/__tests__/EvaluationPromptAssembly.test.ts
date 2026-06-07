/**
 * Hermetic PROMPT-ASSEMBLY tests for EvaluationService's LLM-as-judge.
 *
 * SCOPE (read this before adding assertions):
 *   This file tests ONLY that the judge prompt is correctly ASSEMBLED — i.e.
 *   that the writerOutput / architectPlan / seedIdea / profilerOutput land in
 *   the messages sent to the model, alongside the rubric system prompt and the
 *   numbered criteria.
 *
 *   It DELIBERATELY does NOT assert that the judge scores a faithful output
 *   higher than an unfaithful one. With a stubbed createCompletion the "score"
 *   is whatever the stub returns, so a discrimination assertion would be
 *   CIRCULAR (it would test the stub, not the judge). Real faithful-vs-unfaithful
 *   discrimination is tested against a REAL model in the promptfoo gate:
 *   api-gateway/evals/golden/faithfulness-pairs.yaml.
 *
 *   Response PARSING is already covered by evaluationResponseParser.test.ts —
 *   not duplicated here.
 *
 * Mock seam mirrors EvaluationService.sampling.test.ts: LangfuseService is
 * class-mocked at module scope (dodges its dynamic import); the service is
 * bare-constructed with OPENAI_API_KEY set, then deps are assigned via `as any`.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {}
    scoreFaithfulness() {} scoreRelevance() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { EvaluationService } from "../services/EvaluationService";

interface CapturedCall {
  system: string;
  user: string;
}

/**
 * Build a real EvaluationService whose createCompletion is stubbed to (a) record
 * the system+user messages it is asked to send and (b) return a valid parseable
 * judge response so the call path completes. Single sample keeps it simple.
 */
function buildServiceCapturingPrompts(): { svc: EvaluationService; calls: CapturedCall[] } {
  process.env.OPENAI_API_KEY = "test-key-for-assembly";
  process.env.EVALUATION_SAMPLES = "1";

  const svc = new EvaluationService();
  const calls: CapturedCall[] = [];

  const createCompletion = jest.fn().mockImplementation((req: any) => {
    const system = req.messages.find((m: any) => m.role === "system")?.content ?? "";
    const user = req.messages.find((m: any) => m.role === "user")?.content ?? "";
    calls.push({ system, user });
    // Valid JSON so parseEvaluationResponse succeeds and the path completes.
    return Promise.resolve({ content: '{"score":0.5,"reasoning":"stub"}' });
  });

  (svc as any).llmProviderService = { createCompletion };
  (svc as any).metricsService = { recordEvaluation: jest.fn() };
  (svc as any).langfuseService = {
    scoreFaithfulness: jest.fn(), scoreRelevance: jest.fn(), addEvent: jest.fn(),
  };

  return { svc, calls };
}

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.EVALUATION_SAMPLES;
  jest.clearAllMocks();
});

describe("EvaluationService — faithfulness prompt assembly (hermetic, NOT discrimination)", () => {
  const ARCHITECT_PLAN = "PLAN_MARKER: Scene ends tragically; the brother dies at sea.";
  const FAITHFUL_OUTPUT = "FAITHFUL_MARKER: She read his name; the Maris was lost with all hands.";
  const UNFAITHFUL_OUTPUT = "UNFAITHFUL_MARKER: The brother was alive after all; he would be home Sunday.";

  it("embeds the architect plan and a faithful writer output in the user prompt", async () => {
    const { svc, calls } = buildServiceCapturingPrompts();

    const result = await svc.evaluateFaithfulness({
      runId: "run-assembly-faithful",
      writerOutput: FAITHFUL_OUTPUT,
      architectPlan: ARCHITECT_PLAN,
      sceneNumber: 1,
    });

    expect(result).not.toBeNull(); // path completed
    expect(calls).toHaveLength(1);
    const { system, user } = calls[0];

    // Inputs land in the assembled USER prompt.
    expect(user).toContain(ARCHITECT_PLAN);
    expect(user).toContain(FAITHFUL_OUTPUT);
    expect(user).toContain("## Architect's Plan");
    expect(user).toContain("## Writer's Output");
    // Key rubric criteria are present.
    expect(user).toContain("Are all key plot points from the plan included?");

    // SYSTEM prompt is the faithfulness rubric demanding JSON {score, reasoning}.
    expect(system).toContain("how faithfully a writer followed an architect's plan");
    expect(system).toContain('{"score": <number 0-1>, "reasoning": "<brief explanation>"}');
  });

  it("embeds an UNFAITHFUL writer output too (assembly only — verdict untested here)", async () => {
    const { svc, calls } = buildServiceCapturingPrompts();

    await svc.evaluateFaithfulness({
      runId: "run-assembly-unfaithful",
      writerOutput: UNFAITHFUL_OUTPUT,
      architectPlan: ARCHITECT_PLAN,
      sceneNumber: 2,
    });

    // We only prove the unfaithful output is ASSEMBLED into the prompt.
    // Whether the judge would FAIL it is the promptfoo gate's job, not this test's.
    expect(calls[0].user).toContain(UNFAITHFUL_OUTPUT);
    expect(calls[0].user).toContain(ARCHITECT_PLAN);
  });
});

describe("EvaluationService — relevance prompt assembly (hermetic)", () => {
  it("embeds the seed idea and profiler output with the relevance rubric", async () => {
    const { svc, calls } = buildServiceCapturingPrompts();
    const SEED = "SEED_MARKER: A noir detective story set in 1947 Los Angeles.";
    const PROFILE = "PROFILE_MARKER: Vivian, a nightclub singer with a hidden past.";

    const result = await svc.evaluateRelevance({
      runId: "run-assembly-relevance",
      profilerOutput: PROFILE,
      seedIdea: SEED,
      characterName: "Vivian",
    });

    expect(result).not.toBeNull();
    const { system, user } = calls[0];

    expect(user).toContain(SEED);
    expect(user).toContain(PROFILE);
    expect(user).toContain("## User's Story Idea");
    expect(user).toContain("## Character Profile");
    expect(user).toContain("Does the character fit the genre and setting?");

    expect(system).toContain("how relevant a character profile is to the user's original story idea");
    expect(system).toContain('{"score": <number 0-1>, "reasoning": "<brief explanation>"}');
  });
});
