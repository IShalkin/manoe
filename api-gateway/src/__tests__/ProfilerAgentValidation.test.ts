/**
 * Tests ProfilerAgent's CHARACTERS-phase validation failure path.
 *
 * Confirmed bug: on CharactersArraySchema validation failure the catch block
 * returned the invalid `parsed` value AND emitted it to the frontend instead of
 * re-throwing. Garbage/unvalidated character profiles flowed downstream and to
 * the UI. Every other agent (Architect, Worldbuilder, Strategist, Critic...)
 * lets `validateOutput`'s ValidationError propagate to the orchestrator. These
 * tests pin the corrected behavior: invalid characters MUST throw and MUST NOT
 * be emitted; valid characters return the validated array.
 *
 * LangfuseService is mocked because BaseAgent imports it and its `langfuse`
 * dependency does a dynamic import that Jest's default VM cannot service.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {}
    endTrace() {}
    startSpan() { return "s"; }
    endSpan() {}
    addEvent() {}
    trackLLMCall() {}
    async getPrompt() { return { compile: () => "" }; }
  },
  AGENT_PROMPTS: {},
  PHASE_PROMPTS: {},
}));

import { ProfilerAgent } from "../agents/ProfilerAgent";
import { ValidationError, CharacterSchema } from "../schemas/AgentSchemas";
import { GenerationPhase } from "../models/LLMModels";
import { AgentContext, GenerationOptions } from "../agents/types";

type AnyObj = Record<string, unknown>;

/**
 * Build a ProfilerAgent whose only outside contact (the LLM) is stubbed to
 * return `llmResponse`. Captures every emitMessage payload so a test can assert
 * whether invalid content leaked to the frontend.
 */
function buildAgent(llmResponse: string): { agent: ProfilerAgent; emitted: AnyObj[] } {
  const emitted: AnyObj[] = [];

  // RedisStreams stub — emitMessage/emitThought publish through publishEvent.
  const redisStreams = {
    publishEvent: jest.fn(async (_runId: string, type: string, payload: AnyObj) => {
      emitted.push({ type, payload });
      return "evt-1";
    }),
  } as unknown as ConstructorParameters<typeof ProfilerAgent>[4];

  // LangfuseService instance (mocked class above). isEnabled=false → fallback prompt.
  const langfuse = {
    isEnabled: false,
    startSpan: () => "s",
    endSpan: () => {},
    addEvent: () => {},
    trackLLMCall: () => {},
  } as unknown as ConstructorParameters<typeof ProfilerAgent>[1];

  const llmProvider = {} as unknown as ConstructorParameters<typeof ProfilerAgent>[0];

  const agent = new ProfilerAgent(llmProvider, langfuse, undefined, undefined, redisStreams);

  // Override the protected LLM call so execute() runs without a real provider.
  (agent as unknown as AnyObj).callLLM = jest.fn(async () => llmResponse);

  return { agent, emitted };
}

function makeContext(): AgentContext {
  return {
    runId: "run-1",
    projectId: "proj-1",
    state: {
      phase: GenerationPhase.CHARACTERS,
      // validateNarrativeContext requires genre + arc to be present.
      narrative: { genre: "sci-fi", arc: "hero's journey", premise: "p", hook: "h" },
    } as unknown as AgentContext["state"],
  };
}

const options: GenerationOptions = {
  projectId: "proj-1",
  seedIdea: "a lonely astronaut",
  llmConfig: { provider: "openai", model: "gpt", apiKey: "k" },
  mode: "full",
};

describe("ProfilerAgent CHARACTERS validation", () => {
  it("throws ValidationError when characters fail the schema (empty array)", async () => {
    // Empty array → CharactersArraySchema is .min(1), so validation fails.
    const { agent } = buildAgent(JSON.stringify([]));
    await expect(agent.execute(makeContext(), options)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws and does NOT emit the invalid content to the frontend (wrong shape)", async () => {
    // Objects missing the required `name` field → invalid characters.
    const garbage = JSON.stringify([{ foo: "bar" }, { baz: 1 }]);
    const { agent, emitted } = buildAgent(garbage);

    await expect(agent.execute(makeContext(), options)).rejects.toBeInstanceOf(ValidationError);

    // The bug emitted an agent_message carrying the garbage characters. After
    // the fix, no agent_message must be published on the failure path.
    const messages = emitted.filter((e) => e.type === "agent_message");
    expect(messages).toHaveLength(0);
  });

  it("returns the validated character array on valid output", async () => {
    const valid = JSON.stringify([
      { name: "Ada", role: "protagonist", motivation: "find home" },
      { name: "Vex", role: "antagonist" },
    ]);
    const { agent, emitted } = buildAgent(valid);

    const result = await agent.execute(makeContext(), options);
    const content = result.content as AnyObj[];
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(2);
    expect(content[0].name).toBe("Ada");

    // Valid path emits exactly one agent_message with the characters.
    const messages = emitted.filter((e) => e.type === "agent_message");
    expect(messages).toHaveLength(1);
  });
});

describe("CharacterSchema voiceExemplars", () => {
  it("accepts an array of exemplar lines", () => {
    const result = CharacterSchema.safeParse({
      name: "Mara",
      role: "protagonist",
      voiceExemplars: [
        "I don't run. I relocate.",
        "Ask me again and I'll forget you asked.",
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voiceExemplars).toHaveLength(2);
    }
  });

  it("is optional (absent is valid)", () => {
    const result = CharacterSchema.safeParse({ name: "Vex", role: "antagonist" });
    expect(result.success).toBe(true);
  });

  it("rejects non-string exemplar entries", () => {
    const result = CharacterSchema.safeParse({
      name: "Mara",
      role: "protagonist",
      voiceExemplars: [42],
    });
    expect(result.success).toBe(false);
  });
});
