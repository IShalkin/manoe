/**
 * Tests for EvaluationService sampler behaviour (issue #168):
 *  1. Every judge call uses temperature 0
 *  2. N=3 calls per evaluation (default)
 *  3. Median of the three scores is reported
 *  4. All-fail → null; recordEvaluation called with success=false
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
import { LangfuseService } from "../services/LangfuseService";
import { MetricsService } from "../services/MetricsService";

/** Minimal stub for LLMProviderService.createCompletion */
function makeCompletionSpy(responses: string[]): { createCompletion: jest.Mock } {
  let callIndex = 0;
  const createCompletion = jest.fn().mockImplementation(() => {
    const content = responses[callIndex % responses.length];
    callIndex++;
    return Promise.resolve({ content });
  });
  return { createCompletion };
}

/** Construct EvaluationService with mocked dependencies and an API key set */
function buildService(completionResponses: string[], sampleCount?: number): EvaluationService {
  process.env.OPENAI_API_KEY = "test-key-for-sampling";
  if (sampleCount !== undefined) {
    process.env.EVALUATION_SAMPLES = String(sampleCount);
  } else {
    delete process.env.EVALUATION_SAMPLES;
  }

  const svc = new EvaluationService();
  const llmMock = makeCompletionSpy(completionResponses);
  const metricsMock = { recordEvaluation: jest.fn() } as unknown as MetricsService;
  const langfuseMock = new LangfuseService() as unknown as LangfuseService;
  jest.spyOn(langfuseMock, "scoreFaithfulness").mockImplementation(() => {});
  jest.spyOn(langfuseMock, "scoreRelevance").mockImplementation(() => {});
  jest.spyOn(langfuseMock, "addEvent").mockImplementation(() => {});

  // Assign mocks onto private fields via type cast
  (svc as any).llmProviderService = llmMock;
  (svc as any).metricsService = metricsMock;
  (svc as any).langfuseService = langfuseMock;

  return svc;
}

const FAITHFULNESS_INPUT = {
  runId: "test-run-sampling",
  writerOutput: "The hero walked into the forest.",
  architectPlan: "Scene: Hero enters forest.",
  sceneNumber: 1,
};

describe("EvaluationService — sampler (issue #168)", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.EVALUATION_SAMPLES;
  });

  it("calls createCompletion exactly 3 times by default", async () => {
    const responses = [
      '{"score":0.4,"reasoning":"r1"}',
      '{"score":0.6,"reasoning":"r2"}',
      '{"score":0.8,"reasoning":"r3"}',
    ];
    const svc = buildService(responses);
    await svc.evaluateFaithfulness(FAITHFULNESS_INPUT);

    const spy = (svc as any).llmProviderService.createCompletion as jest.Mock;
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("every createCompletion call uses temperature 0", async () => {
    const responses = [
      '{"score":0.4,"reasoning":"r1"}',
      '{"score":0.6,"reasoning":"r2"}',
      '{"score":0.8,"reasoning":"r3"}',
    ];
    const svc = buildService(responses);
    await svc.evaluateFaithfulness(FAITHFULNESS_INPUT);

    const spy = (svc as any).llmProviderService.createCompletion as jest.Mock;
    for (const call of spy.mock.calls) {
      expect(call[0].temperature).toBe(0);
    }
  });

  it("reports the median score (0.6 for [0.4, 0.6, 0.8])", async () => {
    const responses = [
      '{"score":0.4,"reasoning":"r1"}',
      '{"score":0.6,"reasoning":"r2"}',
      '{"score":0.8,"reasoning":"r3"}',
    ];
    const svc = buildService(responses);
    const result = await svc.evaluateFaithfulness(FAITHFULNESS_INPUT);

    expect(result).not.toBeNull();
    expect(result!.score).toBeCloseTo(0.6);
  });

  it("returns null and records failure when all samples produce unparseable output", async () => {
    const responses = ["not json", "also not json", "still not json"];
    const svc = buildService(responses);
    const metricsSpy = (svc as any).metricsService.recordEvaluation as jest.Mock;

    const result = await svc.evaluateFaithfulness(FAITHFULNESS_INPUT);

    expect(result).toBeNull();
    expect(metricsSpy).toHaveBeenCalledWith(
      "faithfulness", "writer", "test-run-sampling", 0, expect.any(Number), false
    );
  });

  it("respects EVALUATION_SAMPLES override (1 sample)", async () => {
    const responses = ['{"score":0.75,"reasoning":"single"}'];
    const svc = buildService(responses, 1);

    const result = await svc.evaluateFaithfulness(FAITHFULNESS_INPUT);
    const spy = (svc as any).llmProviderService.createCompletion as jest.Mock;

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result!.score).toBeCloseTo(0.75);
  });
});
