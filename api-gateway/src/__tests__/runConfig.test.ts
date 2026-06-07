import { createRunConfig, recordPhase } from "../utils/runConfig";

describe("runConfig builder", () => {
  it("creates an empty-phase config", () => {
    const c = createRunConfig("r1", 42, { provider: "openai", model: "gpt-5.5", temperature: 0.7 });
    expect(c).toEqual({ runId: "r1", seed: 42, requested: { provider: "openai", model: "gpt-5.5", temperature: 0.7 }, phases: {} });
  });

  it("records a phase with resolved model", () => {
    const c = createRunConfig("r1", 42, { provider: "openai", model: "gpt-5.5", temperature: 0.7 });
    recordPhase(c, "Genesis", { provider: "openai", requestedModel: "gpt-5.5", resolvedModel: "gpt-5.5-2026-05-01", temperature: 0.7, seed: 42, maxTokens: 4096 }, "2026-06-07T00:00:00.000Z");
    expect(c.phases.Genesis.resolvedModel).toBe("gpt-5.5-2026-05-01");
    expect(c.phases.Genesis.recordedAt).toBe("2026-06-07T00:00:00.000Z");
  });

  it("last write wins for a repeated phase (revision loop)", () => {
    const c = createRunConfig("r1", 42, { provider: "openai", model: "gpt-5.5", temperature: 0.7 });
    recordPhase(c, "Drafting", { provider: "openai", requestedModel: "m", resolvedModel: "v1", temperature: 0.7, maxTokens: 1 }, "t1");
    recordPhase(c, "Drafting", { provider: "openai", requestedModel: "m", resolvedModel: "v2", temperature: 0.7, maxTokens: 1 }, "t2");
    expect(c.phases.Drafting.resolvedModel).toBe("v2");
    expect(Object.keys(c.phases)).toEqual(["Drafting"]);
  });
});
