/**
 * Unit tests for LLMProviderService.parseGeminiResponse.
 *
 * Bugs being fixed:
 *  1. Usage tokens were hardcoded to 0, so all Gemini cost/token metrics were
 *     silently zero.
 *  2. response.text() throws when Gemini blocks a response for safety (empty
 *     candidates); the `?? ""` could not catch a throw, crashing the agent.
 */
import { LLMProviderService } from "../services/LLMProviderService";

type ParsedGemini = { content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; finishReason: string };
const parse = (resp: unknown): ParsedGemini =>
  (LLMProviderService as unknown as { parseGeminiResponse(r: unknown): ParsedGemini }).parseGeminiResponse(resp);

describe("LLMProviderService.parseGeminiResponse", () => {
  it("extracts content and real token usage from usageMetadata", () => {
    const resp = {
      text: () => "Generated story text",
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 120,
        candidatesTokenCount: 340,
        totalTokenCount: 460,
      },
    };
    const out = parse(resp);
    expect(out.content).toBe("Generated story text");
    expect(out.usage.promptTokens).toBe(120);
    expect(out.usage.completionTokens).toBe(340);
    expect(out.usage.totalTokens).toBe(460);
    expect(out.finishReason).toBe("STOP");
  });

  // --- bug 2: safety block ---
  it("does not throw when the response is safety-blocked (empty candidates, text() throws)", () => {
    const resp = {
      text: () => {
        throw new Error("Cannot read response: candidates is empty (blocked)");
      },
      candidates: [],
      promptFeedback: { blockReason: "SAFETY" },
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 0, totalTokenCount: 50 },
    };
    let out: ParsedGemini | undefined;
    expect(() => {
      out = parse(resp);
    }).not.toThrow();
    expect(out!.content).toBe("");
    expect(out!.finishReason).toBe("SAFETY");
    expect(out!.usage.promptTokens).toBe(50);
  });

  it("falls back to zero usage when usageMetadata is absent (without throwing)", () => {
    const resp = { text: () => "hi", candidates: [{ finishReason: "STOP" }] };
    const out = parse(resp);
    expect(out.content).toBe("hi");
    expect(out.usage.totalTokens).toBe(0);
    expect(out.finishReason).toBe("STOP");
  });

  it("defaults finishReason to 'stop' when not provided", () => {
    const resp = { text: () => "x", candidates: [{}], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };
    expect(parse(resp).finishReason).toBe("stop");
  });
});
