// Mock heavy/transitive deps BEFORE importing BaseAgent (see BaseAgentParseJSON.test.ts).
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {},
  AGENT_PROMPTS: {},
  PHASE_PROMPTS: {},
}));
jest.mock("../services/LLMProviderService", () => ({
  LLMProviderService: class {},
}));
jest.mock("../services/RedisStreamsService", () => ({
  RedisStreamsService: class {},
}));

import { z } from "zod";
import { BaseAgent } from "../agents/BaseAgent";
import { AgentType } from "../models/AgentModels";
import { AgentContext, AgentOutput, GenerationOptions } from "../agents/types";
import { ValidationError } from "../schemas/AgentSchemas";

const addEvent = jest.fn();

class TestAgent extends BaseAgent {
  constructor() {
    // langfuse is the 3rd ctor arg; a no-op addEvent is all validateOutput touches on failure.
    super(AgentType.WRITER, {} as never, { addEvent } as never);
  }
  async execute(_c: AgentContext, _o: GenerationOptions): Promise<AgentOutput> {
    return { content: {} };
  }
  // Expose the protected method.
  public callValidateOutput<T>(data: unknown, schema: z.ZodSchema<T>, runId: string): T {
    return this.validateOutput(data, schema, runId);
  }
}

const schema = z.object({ name: z.string() });

describe("BaseAgent.validateOutput (real shipped behavior)", () => {
  beforeEach(() => addEvent.mockClear());

  it("returns the parsed data on a valid payload", () => {
    const agent = new TestAgent();
    expect(agent.callValidateOutput({ name: "ok" }, schema, "run-1")).toEqual({ name: "ok" });
    expect(addEvent).not.toHaveBeenCalled();
  });

  it("throws ValidationError and logs to langfuse on an invalid payload", () => {
    const agent = new TestAgent();
    expect(() => agent.callValidateOutput({ name: 123 }, schema, "run-1")).toThrow(ValidationError);
    expect(addEvent).toHaveBeenCalledWith(
      "run-1",
      "validation_error",
      expect.objectContaining({ agent: AgentType.WRITER })
    );
  });
});
