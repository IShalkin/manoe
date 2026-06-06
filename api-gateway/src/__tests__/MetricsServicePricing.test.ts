import { describe, it, expect, beforeEach } from "@jest/globals";
import { MetricsService } from "../services/MetricsService";

/**
 * Regression + fix tests for Bedrock inference-profile model id pricing.
 *
 * Bug: normalizeModelName() only stripped a `provider/` slash prefix and a
 * trailing `-YYYY-MM-DD` date. Bedrock inference-profile ids such as
 * `us.anthropic.claude-opus-4-8` were never reduced to a MODEL_PRICING key,
 * so they fell through to the `default` ($0.001/$0.002 per 1K) pricing,
 * understating the real Opus cost (~$0.015/$0.075 per 1K) by ~15-37x.
 */

// Known reference values from MODEL_PRICING (per 1K tokens)
const DEFAULT_PRICING = { input: 0.001, output: 0.002 };
const OPUS_PRICING = { input: 0.015, output: 0.075 };
const SONNET_PRICING = { input: 0.003, output: 0.015 };

describe("MetricsService - Bedrock model pricing normalization", () => {
  let svc: MetricsService;
  // Helper for the private method
  const norm = (id: string): string => (svc as any).normalizeModelName(id);

  beforeEach(() => {
    svc = new MetricsService();
  });

  describe("normalizeModelName - Bedrock inference profiles", () => {
    it("normalizes us.anthropic.claude-opus-4-8 to a non-default Opus key", () => {
      const key = norm("us.anthropic.claude-opus-4-8");
      // Must NOT remain the raw bedrock id (which would resolve to default)
      expect(key).not.toBe("us.anthropic.claude-opus-4-8");
      // Must resolve to Opus-level pricing, not default
      const cost = svc.calculateCost("us.anthropic.claude-opus-4-8", 1000, 1000);
      const opusCost = OPUS_PRICING.input + OPUS_PRICING.output;
      const defaultCost = DEFAULT_PRICING.input + DEFAULT_PRICING.output;
      expect(cost).toBeCloseTo(opusCost, 6);
      expect(cost).not.toBeCloseTo(defaultCost, 6);
    });

    it("normalizes eu.anthropic.claude-sonnet-4 to Sonnet pricing", () => {
      const cost = svc.calculateCost("eu.anthropic.claude-sonnet-4", 1000, 1000);
      const sonnetCost = SONNET_PRICING.input + SONNET_PRICING.output;
      expect(cost).toBeCloseTo(sonnetCost, 6);
    });

    it("handles global. and apac. region prefixes", () => {
      const globalCost = svc.calculateCost("global.anthropic.claude-opus-4-8", 1000, 1000);
      const apacCost = svc.calculateCost("apac.anthropic.claude-sonnet-4", 1000, 1000);
      expect(globalCost).toBeCloseTo(OPUS_PRICING.input + OPUS_PRICING.output, 6);
      expect(apacCost).toBeCloseTo(SONNET_PRICING.input + SONNET_PRICING.output, 6);
    });
  });

  describe("regression - existing ids still normalize correctly", () => {
    it("gpt-4o stays gpt-4o", () => {
      expect(norm("gpt-4o")).toBe("gpt-4o");
      expect(svc.calculateCost("gpt-4o", 1000, 1000)).toBeCloseTo(0.005 + 0.015, 6);
    });

    it("claude-opus-4 stays claude-opus-4", () => {
      expect(norm("claude-opus-4")).toBe("claude-opus-4");
      expect(svc.calculateCost("claude-opus-4", 1000, 1000)).toBeCloseTo(
        OPUS_PRICING.input + OPUS_PRICING.output,
        6
      );
    });

    it("OpenRouter slash id anthropic/claude-3-5-haiku normalizes to claude-3-5-haiku", () => {
      expect(norm("anthropic/claude-3-5-haiku")).toBe("claude-3-5-haiku");
      expect(svc.calculateCost("anthropic/claude-3-5-haiku", 1000, 1000)).toBeCloseTo(
        0.001 + 0.005,
        6
      );
    });

    it("dated id gpt-4o-2024-05-13 strips the date and normalizes to gpt-4o", () => {
      expect(norm("gpt-4o-2024-05-13")).toBe("gpt-4o");
      expect(svc.calculateCost("gpt-4o-2024-05-13", 1000, 1000)).toBeCloseTo(
        0.005 + 0.015,
        6
      );
    });

    it("does not over-strip a non-region two-letter-ish token (gpt-4o not mangled)", () => {
      // gpt-4o does not start with a 2-letter region prefix + '.', so untouched
      expect(norm("gpt-4o-mini")).toBe("gpt-4o-mini");
    });

    it("unknown model still falls through to default", () => {
      expect(svc.calculateCost("totally-unknown-model", 1000, 1000)).toBeCloseTo(
        DEFAULT_PRICING.input + DEFAULT_PRICING.output,
        6
      );
    });
  });

  describe("recordLLMCall cost path produces Opus-level cost for Bedrock", () => {
    it("computes Opus cost, not default, for a Bedrock Opus call", () => {
      // calculateCost is the same code path recordLLMCall uses internally.
      const cost = svc.calculateCost("us.anthropic.claude-opus-4-8", 10000, 2000);
      // 10K input * 0.015 + 2K output * 0.075 = 0.15 + 0.15 = 0.30
      expect(cost).toBeCloseTo(0.3, 6);
      // default would be 10*0.001 + 2*0.002 = 0.014 -- assert clearly different
      expect(cost).toBeGreaterThan(0.1);
    });
  });
});
