/**
 * LLM Provider Service
 * Unified model client adapter supporting multiple LLM providers (BYOK)
 *
 * Supports:
 * - OpenAI (GPT-5.2, GPT-5, O3, etc.)
 * - Anthropic Claude (Opus 4.5, Sonnet 4, etc.)
 * - Google Gemini (Gemini 3 Pro, Flash, etc.)
 * - OpenRouter (access to all models)
 * - DeepSeek (V3, R1)
 * - Venice AI (Dolphin Mistral, Llama 4 Maverick)
 */
import { LLMResponse, CompletionOptions } from "../models/LLMModels";
/**
 * Token limit error information extracted from provider error messages
 */
export interface TokenLimitError {
    requested: number;
    allowed: number;
    provider: string;
}
/**
 * Extract max output tokens limit from provider error messages
 * Supports multiple provider error formats for auto-discovery of limits
 *
 * @param provider - The LLM provider name
 * @param error - The error object or message string
 * @returns TokenLimitError if limit was extracted, null otherwise
 */
export declare function extractMaxOutputTokensFromError(provider: string, error: Error | string): TokenLimitError | null;
/**
 * In-memory cache for discovered token limits
 * Persists limits to Redis if available for cross-instance sharing
 */
export declare class TokenLimitCache {
    private memoryCache;
    private redisClient;
    private static instance;
    private constructor();
    static getInstance(): TokenLimitCache;
    /**
     * Set Redis client for persistent caching
     */
    setRedisClient(client: {
        get: (key: string) => Promise<string | null>;
        setex: (key: string, ttl: number, value: string) => Promise<unknown>;
    }): void;
    /**
     * Get cached token limit for a model
     * Checks memory first, then Redis if available
     */
    get(model: string): Promise<number | null>;
    /**
     * Cache a discovered token limit
     * Stores in memory and Redis (with 7-day TTL)
     */
    set(model: string, limit: number): Promise<void>;
    /**
     * Normalize model name for consistent caching
     */
    private normalizeModelName;
    /**
     * Clear the cache (useful for testing)
     */
    clear(): void;
}
export declare class LLMProviderService {
    /**
     * Create a chat completion using the specified provider
     *
     * @param options - Completion options including messages, model, provider, and API key
     * @returns Unified LLM response
     */
    createCompletion(options: CompletionOptions): Promise<LLMResponse>;
    /**
     * Common placeholder keys that should be rejected
     */
    private static readonly PLACEHOLDER_KEYS;
    /**
     * Get API key with fallback to environment variable
     * BYOK (Bring Your Own Key) takes precedence over env fallback
     *
     * Security: API keys are never logged or included in error messages
     */
    private getApiKey;
    /**
     * OpenAI completion
     */
    private openAICompletion;
    /**
     * Anthropic Claude completion
     */
    private anthropicCompletion;
    /**
     * Google Gemini completion
     */
    private geminiCompletion;
    /**
     * OpenRouter completion (OpenAI-compatible API)
     */
    private openRouterCompletion;
    /**
     * DeepSeek completion (OpenAI-compatible API)
     */
    private deepSeekCompletion;
    /**
     * Venice AI completion (OpenAI-compatible API)
     */
    private veniceCompletion;
    /**
     * Format messages for OpenAI-compatible APIs
     */
    private formatMessagesForOpenAI;
    /**
     * Check if an error is retryable (rate limit, server error, timeout)
     */
    isRetryableError(error: unknown): boolean;
    /**
     * Check if an error is a token limit error that can be retried with a lower limit
     */
    private isTokenLimitError;
    /**
     * Create completion with automatic retry for transient errors
     * Also handles token limit errors with auto-discovery and caching
     */
    createCompletionWithRetry(options: CompletionOptions, maxRetries?: number, baseDelayMs?: number): Promise<LLMResponse>;
}
//# sourceMappingURL=LLMProviderService.d.ts.map