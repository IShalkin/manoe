/**
 * Slice 2: SpiceConfig is an opt-in side config (default off). This pins its
 * shape and that GenerationOptions accepts it as optional.
 */
import type { GenerationOptions, SpiceConfig } from "../agents/types";
import { GenerationState } from "../models/AgentModels";

describe("SpiceConfig type", () => {
  it("accepts a fully-specified spice config on GenerationOptions", () => {
    const spice: SpiceConfig = {
      provider: "openrouter",
      model: "some/uncensored-model",
      apiKey: "sk-test",
      ceiling: "explicit, consensual",
    };
    const opts: GenerationOptions = {
      projectId: "p", seedIdea: "s",
      llmConfig: { provider: "anthropic", model: "claude-opus-4-5", apiKey: "k" },
      mode: "full",
      spiceConfig: spice,
    };
    expect(opts.spiceConfig?.provider).toBe("openrouter");
  });

  it("is optional (absent is valid)", () => {
    const opts: GenerationOptions = {
      projectId: "p", seedIdea: "s",
      llmConfig: { provider: "anthropic", model: "claude-opus-4-5", apiKey: "k" },
      mode: "full",
    };
    expect(opts.spiceConfig).toBeUndefined();
  });
});

describe("GenerationState.spiceRegions", () => {
  it("initializes to an empty Map", () => {
    const state = new GenerationState();
    expect(state.spiceRegions instanceof Map).toBe(true);
    expect(state.spiceRegions.size).toBe(0);
  });
});
