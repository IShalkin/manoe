/**
 * Guard test: the StorytellerOrchestrator module must be loadable under Jest.
 *
 * The hard blocker is the third-party `langfuse` package, which performs a
 * dynamic import() at module-eval time (langfuse-core/.../LangfuseMedia.ts).
 * Jest's default VM cannot service dynamic imports, so we replace our
 * LangfuseService wrapper with a factory mock — that way the real langfuse
 * package is never required, and the orchestrator and all its other deps load.
 *
 * (SupabaseService previously also used `await import()` of local utils; that
 * has been converted to static imports.)
 */
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
import { SupabaseService } from "../services/SupabaseService";

describe("StorytellerOrchestrator module import", () => {
  it("loads the real class once LangfuseService is mocked", () => {
    expect(StorytellerOrchestrator).toBeDefined();
    expect(typeof StorytellerOrchestrator).toBe("function");
  });

  it("loads SupabaseService without dynamic-import errors (local utils now static)", () => {
    expect(SupabaseService).toBeDefined();
  });
});
