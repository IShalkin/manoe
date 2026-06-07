/**
 * Task 1 (issue #162): assert that resolvedModel is populated from the
 * provider's response.model when present, and falls back to options.model
 * when the provider omits it.
 *
 * Both cases are driven through the REAL openAICompletion private method
 * (bracket access) with the OpenAI client mocked at the makeOpenAIClient
 * seam — the same pattern used by AnthropicCacheControl.test.ts.
 */

import { LLMProviderService } from "../services/LLMProviderService";
import { LLMProvider, MessageRole } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

/** Minimal options to reach the resolvedModel line without hitting the network. */
function baseOptions(extra: AnyObj = {}): AnyObj {
  return {
    provider: LLMProvider.OPENAI,
    model: "gpt-5.5",
    apiKey: "sk-test-resolvedmodel-0001",
    temperature: 0.7,
    maxTokens: 256,
    messages: [
      { role: MessageRole.SYSTEM, content: "You are a helpful assistant." },
      { role: MessageRole.USER, content: "Hello." },
    ],
    ...extra,
  };
}

/** Minimal OpenAI-shaped response the production code reads from. */
function fakeOpenAIResponse(overrides: AnyObj = {}): AnyObj {
  return {
    model: "gpt-5.5-2026-05-01",
    choices: [{ message: { content: "Hi there!" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    ...overrides,
  };
}

describe("resolvedModel in LLMResponse (issue #162)", () => {
  it("resolvedModel is taken from response.model when provider returns a pinned snapshot id", async () => {
    const svc = new LLMProviderService();
    const o = svc as unknown as AnyObj;

    const fakeCreate = jest.fn(async () => fakeOpenAIResponse());
    o.makeOpenAIClient = jest.fn(() => ({ chat: { completions: { create: fakeCreate } } }));

    const res = await (o.openAICompletion as (opt: AnyObj) => Promise<AnyObj>)(baseOptions());

    // The production line: resolvedModel: response.model ?? options.model
    expect(res.resolvedModel).toBe("gpt-5.5-2026-05-01");
    // model field carries the alias that was requested
    expect(res.model).toBe("gpt-5.5");
    // They are different — the provider resolved the alias to a pinned id
    expect(res.resolvedModel).not.toBe(res.model);
    expect(fakeCreate).toHaveBeenCalledTimes(1);
  });

  it("resolvedModel falls back to options.model when provider omits response.model", async () => {
    const svc = new LLMProviderService();
    const o = svc as unknown as AnyObj;

    // Simulate a provider response without a model field
    const fakeCreate = jest.fn(async () =>
      fakeOpenAIResponse({ model: undefined })
    );
    o.makeOpenAIClient = jest.fn(() => ({ chat: { completions: { create: fakeCreate } } }));

    const res = await (o.openAICompletion as (opt: AnyObj) => Promise<AnyObj>)(baseOptions());

    // Fallback: resolvedModel === options.model
    expect(res.resolvedModel).toBe("gpt-5.5");
    expect(res.resolvedModel).toBe(res.model);
    expect(fakeCreate).toHaveBeenCalledTimes(1);
  });
});
