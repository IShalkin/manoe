/**
 * Tests for retry-budget accounting and backoff jitter in
 * LLMProviderService.createCompletionWithRetry.
 *
 * These exercise the REAL service class. `createCompletion` (the per-attempt
 * provider dispatch called inside the retry loop) is spied on to throw
 * controlled errors in sequence, and the internal sleep is stubbed so tests
 * run instantly.
 *
 * Bug 1 (retry budget stolen): temperature-unsupported and token-limit
 * corrective retries used `continue` inside the attempt loop, so each
 * non-transient corrective retry consumed a slot meant for transient
 * (429/5xx/timeout) retries. With maxRetries=3, two corrective retries left
 * zero real transient retries.
 *
 * Bug 2 (no jitter): backoff was a deterministic baseDelayMs * 2^attempt with
 * no randomization, causing a thundering herd. computeBackoffDelay now applies
 * full jitter within a known bound.
 */

import { LLMProviderService } from "../services/LLMProviderService";
import { LLMProvider } from "../models/LLMModels";

// Minimal error shape mirroring how provider SDKs surface HTTP failures.
class StatusError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "StatusError";
    this.status = status;
  }
}

function newService(): LLMProviderService {
  return new LLMProviderService();
}

function baseOptions() {
  return {
    provider: LLMProvider.ANTHROPIC,
    model: "claude-opus-4",
    messages: [{ role: "user", content: "hi" } as any],
    temperature: 0.7,
    maxTokens: 10240,
  } as any;
}

const okResponse = {
  content: "ok",
  model: "claude-opus-4",
  provider: LLMProvider.ANTHROPIC,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  finishReason: "stop",
} as any;

describe("createCompletionWithRetry — retry budget accounting", () => {
  let svc: LLMProviderService;

  beforeEach(() => {
    svc = newService();
    // Stub the internal sleep so backoff waits do not slow the suite and so we
    // never depend on real timers.
    jest.spyOn(svc as any, "sleep").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does NOT spend transient-retry budget on a temperature corrective retry", async () => {
    // Sequence with maxRetries=3:
    //   1) temperature-unsupported error  -> corrective (must NOT cost a slot)
    //   2) 503                            -> transient retry #1
    //   3) 503                            -> transient retry #2
    //   4) success
    // If corrective retries steal the budget, the second 503 would exhaust the
    // loop and the call would reject instead of succeeding.
    const spy = jest
      .spyOn(svc as any, "createCompletion")
      .mockRejectedValueOnce(new Error("temperature does not support this value"))
      .mockRejectedValueOnce(new StatusError("Service Unavailable", 503))
      .mockRejectedValueOnce(new StatusError("Service Unavailable", 503))
      .mockResolvedValueOnce(okResponse);

    const result = await svc.createCompletionWithRetry(baseOptions(), 3, 1);

    expect(result).toBe(okResponse);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("does NOT spend transient-retry budget on a token-limit corrective retry", async () => {
    // Sequence with maxRetries=3:
    //   1) token-limit error              -> corrective (must NOT cost a slot)
    //   2) 503                            -> transient retry #1
    //   3) 503                            -> transient retry #2
    //   4) success
    const spy = jest
      .spyOn(svc as any, "createCompletion")
      .mockRejectedValueOnce(new Error("max_tokens: 10240 > 8192, which is the maximum"))
      .mockRejectedValueOnce(new StatusError("Service Unavailable", 503))
      .mockRejectedValueOnce(new StatusError("Service Unavailable", 503))
      .mockResolvedValueOnce(okResponse);

    const result = await svc.createCompletionWithRetry(baseOptions(), 3, 1);

    expect(result).toBe(okResponse);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("preserves the full transient budget even with BOTH corrective retries", async () => {
    // maxRetries=3 means at most 2 transient retries (3 attempts total) AFTER
    // any corrective retries. With both corrective retries first:
    //   1) temperature corrective
    //   2) token-limit corrective
    //   3) 503  -> transient retry #1
    //   4) 503  -> transient retry #2
    //   5) success
    const spy = jest
      .spyOn(svc as any, "createCompletion")
      .mockRejectedValueOnce(new Error("temperature is unsupported on this model"))
      .mockRejectedValueOnce(new Error("max_tokens: 10240 > 8192, which is the maximum"))
      .mockRejectedValueOnce(new StatusError("Service Unavailable", 503))
      .mockRejectedValueOnce(new StatusError("Service Unavailable", 503))
      .mockResolvedValueOnce(okResponse);

    const result = await svc.createCompletionWithRetry(baseOptions(), 3, 1);

    expect(result).toBe(okResponse);
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it("still caps transient retries at maxRetries when there is no corrective retry", async () => {
    // maxRetries=3 -> 1 initial attempt + 2 transient retries = 3 attempts, then throw.
    const spy = jest
      .spyOn(svc as any, "createCompletion")
      .mockRejectedValue(new StatusError("Service Unavailable", 503));

    await expect(svc.createCompletionWithRetry(baseOptions(), 3, 1)).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("each corrective retry happens at most once (single-shot guards preserved)", async () => {
    // Two temperature errors in a row: the first is corrected, the second is
    // not retryable as a corrective and is not a transient error, so it throws
    // immediately after the single corrective retry.
    const spy = jest
      .spyOn(svc as any, "createCompletion")
      .mockRejectedValueOnce(new Error("temperature does not support this value"))
      .mockRejectedValueOnce(new Error("temperature does not support this value"));

    await expect(svc.createCompletionWithRetry(baseOptions(), 3, 1)).rejects.toThrow(
      /temperature/i
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("computeBackoffDelay — full jitter", () => {
  it("returns a value within [0, base * 2^attempt] for each attempt", () => {
    const base = 1000;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ceil = base * Math.pow(2, attempt);
      for (let i = 0; i < 50; i++) {
        const delay = LLMProviderService.computeBackoffDelay(attempt, base);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(ceil);
      }
    }
  });

  it("has a ceiling that grows with attempt (exponential envelope)", () => {
    const base = 1000;
    // Sample the max observed delay per attempt; the envelope must be monotonic.
    const sampleMax = (attempt: number): number => {
      let max = 0;
      for (let i = 0; i < 500; i++) {
        max = Math.max(max, LLMProviderService.computeBackoffDelay(attempt, base));
      }
      return max;
    };
    const m0 = sampleMax(0);
    const m1 = sampleMax(1);
    const m2 = sampleMax(2);
    // Observed maxima should respect the exponential ceiling ordering.
    expect(m1).toBeGreaterThan(m0);
    expect(m2).toBeGreaterThan(m1);
  });

  it("never exceeds the exponential ceiling", () => {
    const base = 500;
    for (let i = 0; i < 1000; i++) {
      const attempt = i % 6;
      const delay = LLMProviderService.computeBackoffDelay(attempt, base);
      expect(delay).toBeLessThanOrEqual(base * Math.pow(2, attempt));
    }
  });
});
