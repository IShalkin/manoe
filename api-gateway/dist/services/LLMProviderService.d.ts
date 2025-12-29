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
     * Create completion with automatic retry for transient errors
     */
    createCompletionWithRetry(options: CompletionOptions, maxRetries?: number, baseDelayMs?: number): Promise<LLMResponse>;
}
//# sourceMappingURL=LLMProviderService.d.ts.map