/**
 * Task 5 (issue #162): verify the recorder closure (recordLLMMeta) correctly
 * populates runConfig.phases when an agent's onLLMCall sink fires.
 *
 * We exercise the private method via bracket access — same pattern as
 * ApprovalThreshold.test.ts — without standing up a full DI container.
 */

jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {} scoreTrace() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";
import { createRunConfig } from "../utils/runConfig";

type AnyObj = Record<string, unknown>;

/** Signature of the private orchestrator recorder under test (issue #162). */
type RecordLLMMeta = (
  runId: string,
  meta: {
    provider: string;
    requestedModel: string;
    resolvedModel: string;
    temperature: number;
    seed?: number;
    maxTokens: number;
    phase: string;
  }
) => void;

function newOrchestrator(): AnyObj {
  return new StorytellerOrchestrator() as unknown as AnyObj;
}

describe("recordLLMMeta (run_config capture, issue #162)", () => {
  it("does nothing when no state exists for the runId", () => {
    const o = newOrchestrator();
    expect(() =>
      (o.recordLLMMeta as RecordLLMMeta)("no-such-run", {
        provider: "openai",
        requestedModel: "gpt-5.5",
        resolvedModel: "gpt-5.5-2026-05-01",
        temperature: 0.7,
        seed: 42,
        maxTokens: 4096,
        phase: "genesis",
      })
    ).not.toThrow();
  });

  it("populates runConfig.phases with the resolved model when state is present", () => {
    const o = newOrchestrator();
    const runId = "test-run-1";

    // Inject a minimal state with a runConfig into activeRuns (private Map).
    const config = createRunConfig(runId, 42, { provider: "openai", model: "gpt-5.5", temperature: 0.7 });
    const fakeState = { projectId: "proj-1", runConfig: config };
    (o.activeRuns as Map<string, unknown>).set(runId, fakeState);

    (o.recordLLMMeta as RecordLLMMeta)(runId, {
      provider: "openai",
      requestedModel: "gpt-5.5",
      resolvedModel: "gpt-5.5-2026-05-01",
      temperature: 0.7,
      seed: 42,
      maxTokens: 4096,
      phase: "genesis",
    });

    expect(config.phases["genesis"]).toBeDefined();
    expect(config.phases["genesis"].resolvedModel).toBe("gpt-5.5-2026-05-01");
    expect(config.phases["genesis"].requestedModel).toBe("gpt-5.5");
    expect(config.phases["genesis"].seed).toBe(42);
    expect(config.phases["genesis"].maxTokens).toBe(4096);
  });

  it("last write wins for a repeated phase (revision loop)", () => {
    const o = newOrchestrator();
    const runId = "test-run-2";

    const config = createRunConfig(runId, 99, { provider: "anthropic", model: "claude-opus-4-5", temperature: 0.9 });
    const fakeState = { projectId: "proj-2", runConfig: config };
    (o.activeRuns as Map<string, unknown>).set(runId, fakeState);

    // First call (initial draft)
    (o.recordLLMMeta as RecordLLMMeta)(runId, {
      provider: "anthropic",
      requestedModel: "claude-opus-4-5",
      resolvedModel: "claude-opus-4-5-20250514",
      temperature: 0.9,
      seed: 99,
      maxTokens: 8192,
      phase: "drafting",
    });

    // Second call (revision)
    (o.recordLLMMeta as RecordLLMMeta)(runId, {
      provider: "anthropic",
      requestedModel: "claude-opus-4-5",
      resolvedModel: "claude-opus-4-5-20250601",
      temperature: 0.9,
      seed: 99,
      maxTokens: 8192,
      phase: "drafting",
    });

    // Last write wins
    expect(config.phases["drafting"].resolvedModel).toBe("claude-opus-4-5-20250601");
    expect(Object.keys(config.phases)).toEqual(["drafting"]);
  });

  it("does nothing when runConfig is absent from state", () => {
    const o = newOrchestrator();
    const runId = "test-run-3";
    // State present but runConfig not set
    (o.activeRuns as Map<string, unknown>).set(runId, { projectId: "proj-3" });

    expect(() =>
      (o.recordLLMMeta as RecordLLMMeta)(runId, {
        provider: "openai",
        requestedModel: "gpt-5.5",
        resolvedModel: "gpt-5.5-2026-05-01",
        temperature: 0.7,
        maxTokens: 4096,
        phase: "characters",
      })
    ).not.toThrow();
  });
});
