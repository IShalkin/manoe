/**
 * Unit tests for LLMProviderService error classification and API-key handling.
 *
 * These test the REAL service class (not a reimplementation). The service
 * imports cleanly under Jest; getApiKey is private and exercised via bracket
 * access since it is pure logic with no injected dependencies.
 */

import { LLMProviderService } from "../services/LLMProviderService";
import { LLMProvider } from "../models/LLMModels";

// Minimal error shapes mirroring how provider SDKs surface HTTP failures.
class StatusError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "StatusError";
    this.status = status;
  }
}

function newService(): LLMProviderService {
  // No injected deps are touched by getApiKey / isRetryableError.
  return new LLMProviderService();
}

describe("LLMProviderService.isRetryableError", () => {
  const svc = newService();

  it("retries a textual rate-limit error", () => {
    expect(svc.isRetryableError(new Error("Rate limit exceeded"))).toBe(true);
  });

  it("retries a textual 429", () => {
    expect(svc.isRetryableError(new Error("Request failed with status 429"))).toBe(true);
  });

  it("retries 5xx server errors by text", () => {
    expect(svc.isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("retries timeouts", () => {
    expect(svc.isRetryableError(new Error("socket timed out"))).toBe(true);
  });

  // --- bug: status-only 429 (no digits/keywords in message) must be retried ---
  it("retries a 429 surfaced via status code with a non-numeric message", () => {
    expect(svc.isRetryableError(new StatusError("Too Many Requests", 429))).toBe(true);
  });

  it("retries a 503 surfaced via status code", () => {
    expect(svc.isRetryableError(new StatusError("Service temporarily down", 503))).toBe(true);
  });

  // --- bug: a 400 whose message merely contains '500' must NOT be retried ---
  it("does NOT retry a 400 validation error that mentions the number 500", () => {
    expect(
      svc.isRetryableError(new StatusError("Field must be at most 500 characters", 400))
    ).toBe(false);
  });

  it("does NOT retry a generic non-transient error", () => {
    expect(svc.isRetryableError(new Error("Invalid request: missing field"))).toBe(false);
  });

  it("does NOT retry a 401 auth error", () => {
    expect(svc.isRetryableError(new StatusError("Unauthorized", 401))).toBe(false);
  });
});

describe("LLMProviderService.getApiKey", () => {
  const svc = newService();
  const call = (provider: LLMProvider, key?: string): string =>
    (svc as unknown as { getApiKey(p: LLMProvider, k?: string): string }).getApiKey(provider, key);

  const ENV_KEYS = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "OPENROUTER_API_KEY",
    "DEEPSEEK_API_KEY",
    "VENICE_API_KEY",
  ];
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns a valid BYOK key as-is", () => {
    const key = "sk-abc123def456ghi789";
    expect(call(LLMProvider.OPENAI, key)).toBe(key);
  });

  it("rejects an exact placeholder and falls back to env", () => {
    process.env.OPENAI_API_KEY = "env-key-value-123456";
    expect(call(LLMProvider.OPENAI, "your-api-key")).toBe("env-key-value-123456");
  });

  // --- bug: a real key that merely CONTAINS 'xxx' must not be treated as placeholder ---
  it("accepts a valid key that happens to contain the substring 'xxx'", () => {
    const key = "sk-live-9fxxx2k7q1m8w3"; // 'xxx' appears inside a legitimate key
    expect(call(LLMProvider.ANTHROPIC, key)).toBe(key);
  });

  it("accepts a valid key containing the substring 'placeholder'", () => {
    const key = "sk-placeholderish-realkey-001";
    expect(call(LLMProvider.DEEPSEEK, key)).toBe(key);
  });

  it("still falls back to env when no BYOK key is supplied", () => {
    process.env.GOOGLE_API_KEY = "google-env-key-7777";
    expect(call(LLMProvider.GEMINI)).toBe("google-env-key-7777");
  });
});
