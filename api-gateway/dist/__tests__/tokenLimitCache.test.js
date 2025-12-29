"use strict";
/**
 * Unit Tests for Token Limit Error Parsing and Cache
 *
 * Tests the error-driven auto-discovery mechanism for max_tokens limits
 */
Object.defineProperty(exports, "__esModule", { value: true });
const LLMProviderService_1 = require("../services/LLMProviderService");
describe("extractMaxOutputTokensFromError", () => {
    describe("Anthropic error format", () => {
        it("should parse Anthropic max_tokens error", () => {
            const error = new Error("max_tokens: 10240 > 8192, which is the maximum allowed for this model");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("anthropic", error);
            expect(result).not.toBeNull();
            expect(result?.requested).toBe(10240);
            expect(result?.allowed).toBe(8192);
            expect(result?.provider).toBe("anthropic");
        });
        it("should parse Anthropic error from string", () => {
            const errorMessage = "max_tokens: 16384 > 4096, which is the maximum";
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("anthropic", errorMessage);
            expect(result).not.toBeNull();
            expect(result?.requested).toBe(16384);
            expect(result?.allowed).toBe(4096);
        });
    });
    describe("OpenAI error format", () => {
        it("should parse OpenAI context length error", () => {
            const error = new Error("This model's maximum context length is 8192 tokens, however you requested 10000 tokens");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("openai", error);
            expect(result).not.toBeNull();
            expect(result?.requested).toBe(10000);
            expect(result?.allowed).toBe(8192);
            expect(result?.provider).toBe("openai");
        });
        it("should parse OpenAI max_tokens too large error", () => {
            const error = new Error("max_tokens is too large: 16384. This model supports at most 8192 completion tokens");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("openai", error);
            expect(result).not.toBeNull();
            expect(result?.requested).toBe(16384);
            expect(result?.allowed).toBe(8192);
        });
    });
    describe("Gemini error format", () => {
        it("should parse Gemini maxOutputTokens error", () => {
            const error = new Error("maxOutputTokens must be <= 8192");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("gemini", error);
            expect(result).not.toBeNull();
            expect(result?.allowed).toBe(8192);
            expect(result?.provider).toBe("gemini");
        });
    });
    describe("DeepSeek error format", () => {
        it("should parse DeepSeek max_tokens error", () => {
            const error = new Error("max_tokens exceeds maximum of 8192");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("deepseek", error);
            expect(result).not.toBeNull();
            expect(result?.allowed).toBe(8192);
            expect(result?.provider).toBe("deepseek");
        });
    });
    describe("Generic error format", () => {
        it("should parse generic exceeds maximum tokens error", () => {
            const error = new Error("Request exceeds the maximum of 4096 tokens allowed");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("unknown", error);
            expect(result).not.toBeNull();
            expect(result?.allowed).toBe(4096);
        });
    });
    describe("Non-matching errors", () => {
        it("should return null for unrelated errors", () => {
            const error = new Error("Network timeout");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("openai", error);
            expect(result).toBeNull();
        });
        it("should return null for rate limit errors", () => {
            const error = new Error("Rate limit exceeded");
            const result = (0, LLMProviderService_1.extractMaxOutputTokensFromError)("openai", error);
            expect(result).toBeNull();
        });
    });
});
describe("TokenLimitCache", () => {
    let cache;
    beforeEach(() => {
        cache = LLMProviderService_1.TokenLimitCache.getInstance();
        cache.clear();
    });
    describe("getInstance", () => {
        it("should return singleton instance", () => {
            const instance1 = LLMProviderService_1.TokenLimitCache.getInstance();
            const instance2 = LLMProviderService_1.TokenLimitCache.getInstance();
            expect(instance1).toBe(instance2);
        });
    });
    describe("get and set", () => {
        it("should store and retrieve token limits", async () => {
            await cache.set("claude-3-5-sonnet", 8192);
            const result = await cache.get("claude-3-5-sonnet");
            expect(result).toBe(8192);
        });
        it("should return null for unknown models", async () => {
            const result = await cache.get("unknown-model");
            expect(result).toBeNull();
        });
        it("should normalize model names with provider prefix", async () => {
            await cache.set("anthropic/claude-3-5-sonnet", 8192);
            const result = await cache.get("claude-3-5-sonnet");
            expect(result).toBe(8192);
        });
        it("should handle model name with version suffix", async () => {
            await cache.set("claude-3-5-sonnet-20241022", 8192);
            const result = await cache.get("claude-3-5-sonnet-20241022");
            expect(result).toBe(8192);
        });
    });
    describe("clear", () => {
        it("should clear all cached limits", async () => {
            await cache.set("model-1", 4096);
            await cache.set("model-2", 8192);
            cache.clear();
            expect(await cache.get("model-1")).toBeNull();
            expect(await cache.get("model-2")).toBeNull();
        });
    });
    describe("Redis integration", () => {
        it("should work without Redis client", async () => {
            await cache.set("test-model", 4096);
            const result = await cache.get("test-model");
            expect(result).toBe(4096);
        });
        it("should use Redis when client is set", async () => {
            const mockRedis = {
                get: jest.fn().mockResolvedValue("8192"),
                setex: jest.fn().mockResolvedValue("OK"),
            };
            cache.setRedisClient(mockRedis);
            cache.clear();
            const result = await cache.get("redis-model");
            expect(mockRedis.get).toHaveBeenCalledWith("token_limit:redis-model");
            expect(result).toBe(8192);
        });
        it("should persist to Redis on set", async () => {
            const mockRedis = {
                get: jest.fn().mockResolvedValue(null),
                setex: jest.fn().mockResolvedValue("OK"),
            };
            cache.setRedisClient(mockRedis);
            await cache.set("new-model", 4096);
            expect(mockRedis.setex).toHaveBeenCalledWith("token_limit:new-model", 7 * 24 * 60 * 60, "4096");
        });
        it("should handle Redis errors gracefully", async () => {
            const mockRedis = {
                get: jest.fn().mockRejectedValue(new Error("Redis connection failed")),
                setex: jest.fn().mockRejectedValue(new Error("Redis connection failed")),
            };
            cache.setRedisClient(mockRedis);
            cache.clear();
            const result = await cache.get("error-model");
            expect(result).toBeNull();
            await expect(cache.set("error-model", 4096)).resolves.not.toThrow();
        });
    });
});
//# sourceMappingURL=tokenLimitCache.test.js.map