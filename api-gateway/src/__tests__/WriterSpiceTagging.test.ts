/**
 * Slice 2: the Writer adds the {{SPICE}} tagging instruction to the DRAFTING
 * prompt only when options.spiceConfig is present. Off by default.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    get isEnabled() { return false; }
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { WriterAgent } from "../agents/WriterAgent";
import { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

function makeWriter(): WriterAgent {
  const langfuse = { isEnabled: false, startSpan: () => "s", endSpan: () => {}, addEvent: () => {}, trackLLMCall: () => {} } as unknown as ConstructorParameters<typeof WriterAgent>[1];
  const llmProvider = {} as unknown as ConstructorParameters<typeof WriterAgent>[0];
  return new WriterAgent(llmProvider, langfuse, undefined, undefined, { publishEvent: jest.fn(async () => "e") } as unknown as ConstructorParameters<typeof WriterAgent>[4]);
}

function draftContext(): AnyObj {
  return {
    runId: "r", projectId: "p",
    state: {
      currentScene: 3,
      outline: { scenes: [{}, {}, { title: "The Crypt", wordCount: 800 }] },
      currentSceneOutline: { title: "The Crypt", wordCount: 800, retrievedContext: "" },
      keyConstraints: [],
      characters: [{ name: "Mara", role: "lead" }],
      worldState: {
        runId: "r", lastUpdatedScene: 2, lastUpdatedAt: "",
        characters: [], locations: [], organizations: [], timeline: [], keyFacts: [],
      },
      advancedPlan: { motifs: { shadow: "doubt" } },
    },
  };
}

function buildPrompt(writer: WriterAgent, context: AnyObj, options: AnyObj): string {
  return (writer as unknown as {
    buildUserPrompt(ctx: AnyObj, opts: AnyObj, phase: GenerationPhase): string;
  }).buildUserPrompt(context, options, GenerationPhase.DRAFTING);
}

const baseOptions: AnyObj = {
  projectId: "p", seedIdea: "s",
  llmConfig: { provider: "anthropic", model: "m", apiKey: "k" },
  mode: "full",
};

describe("WriterAgent spice tagging instruction", () => {
  it("omits the tagging instruction when spiceConfig is absent (standard draft)", () => {
    const prompt = buildPrompt(makeWriter(), draftContext(), baseOptions);
    expect(prompt).not.toContain("{{SPICE");
  });

  it("includes the tagging instruction when spiceConfig is present (standard draft)", () => {
    const opts = { ...baseOptions, spiceConfig: { provider: "openrouter", model: "x", apiKey: "k" } };
    const prompt = buildPrompt(makeWriter(), draftContext(), opts);
    expect(prompt).toContain("{{SPICE");
    expect(prompt).toContain("{{/SPICE}}");
  });

  describe("beats first-part draft", () => {
    function beatsContext(): AnyObj {
      const c = draftContext();
      const s = c.state as AnyObj;
      s.currentSceneOutline = {
        title: "The Crypt", wordCount: 800, retrievedContext: "",
        beatsMode: true, partIndex: 1, partsTotal: 3, partTargetWords: 500,
        isFirstPart: true,
      };
      return c;
    }

    it("omits the tagging instruction when spiceConfig is absent", () => {
      const prompt = buildPrompt(makeWriter(), beatsContext(), baseOptions);
      expect(prompt).not.toContain("{{SPICE");
    });

    it("includes the tagging instruction when spiceConfig is present", () => {
      const opts = { ...baseOptions, spiceConfig: { provider: "openrouter", model: "x", apiKey: "k" } };
      const prompt = buildPrompt(makeWriter(), beatsContext(), opts);
      expect(prompt).toContain("{{SPICE");
      expect(prompt).toContain("{{/SPICE}}");
    });
  });
});
