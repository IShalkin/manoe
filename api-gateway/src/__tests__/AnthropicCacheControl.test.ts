/**
 * Slice 1b: the Anthropic request sends the system prompt as a content block
 * array carrying cache_control ephemeral, and the response's cache usage is
 * surfaced. Other providers are unaffected (not covered here).
 */
import { LLMProviderService } from "../services/LLMProviderService";
import { LLMProvider, MessageRole } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

describe("anthropicCompletion prompt caching", () => {
  it("sends system as a cache_control ephemeral block and reports cache usage", async () => {
    const svc = new LLMProviderService();
    const o = svc as unknown as AnyObj;

    let captured: AnyObj | undefined;
    const fakeCreate = jest.fn(async (req: AnyObj) => {
      captured = req;
      return {
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 },
        stop_reason: "end_turn",
      };
    });
    o.makeAnthropicClient = jest.fn(() => ({ messages: { create: fakeCreate } }));

    const res = await (o.anthropicCompletion as (opt: AnyObj) => Promise<AnyObj>)({
      provider: LLMProvider.ANTHROPIC,
      model: "claude-opus-4.5",
      apiKey: "sk-ant-test-0123456789",
      temperature: 0.7,
      maxTokens: 1000,
      messages: [
        { role: MessageRole.SYSTEM, content: "You are the Writer. Stable prefix." },
        { role: MessageRole.USER, content: "Write scene 1." },
      ],
    });

    expect(Array.isArray((captured as AnyObj).system)).toBe(true);
    const sys = (captured as AnyObj).system as AnyObj[];
    expect(sys[sys.length - 1].cache_control).toEqual({ type: "ephemeral" });
    expect(sys.map((b) => b.text).join("")).toContain("Stable prefix");
    expect((res.usage as AnyObj).cacheCreationTokens).toBe(100);
    expect((res.usage as AnyObj).cacheReadTokens).toBe(0);
  });
});
