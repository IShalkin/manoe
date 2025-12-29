"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var LLMProviderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMProviderService = exports.TokenLimitCache = void 0;
exports.extractMaxOutputTokensFromError = extractMaxOutputTokensFromError;
const di_1 = require("@tsed/di");
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const generative_ai_1 = require("@google/generative-ai");
const LLMModels_1 = require("../models/LLMModels");
/**
 * Provider base URLs
 */
const PROVIDER_BASE_URLS = {
    openai: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    deepseek: "https://api.deepseek.com/v1",
    venice: "https://api.venice.ai/api/v1",
};
/**
 * Model context length limits (total tokens including prompt + completion)
 * Used to cap max_tokens to avoid exceeding model limits
 */
const MODEL_CONTEXT_LENGTHS = {
    // GPT-4 variants
    "gpt-4": 8192,
    "gpt-4-0314": 8192,
    "gpt-4-0613": 8192,
    "gpt-4-32k": 32768,
    "gpt-4-32k-0314": 32768,
    "gpt-4-32k-0613": 32768,
    "gpt-4-turbo": 128000,
    "gpt-4-turbo-preview": 128000,
    "gpt-4-1106-preview": 128000,
    "gpt-4-0125-preview": 128000,
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    // GPT-3.5 variants
    "gpt-3.5-turbo": 16385,
    "gpt-3.5-turbo-16k": 16385,
    "gpt-3.5-turbo-1106": 16385,
    "gpt-3.5-turbo-0125": 16385,
    // Default for unknown models (assume large context)
    "default": 128000,
};
/**
 * Model max OUTPUT token limits (completion tokens only)
 * Different from context length - this is the max tokens the model can generate
 * Used to prevent "max_tokens exceeds model limit" errors
 */
const MODEL_MAX_OUTPUT_TOKENS = {
    // Claude models (Anthropic)
    "claude-3-5-haiku": 8192,
    "claude-3-5-sonnet": 8192,
    "claude-3-haiku": 4096,
    "claude-3-sonnet": 4096,
    "claude-3-opus": 4096,
    "claude-opus-4": 16384,
    "claude-sonnet-4": 16384,
    // GPT-4 variants (OpenAI)
    "gpt-4": 8192,
    "gpt-4-0314": 8192,
    "gpt-4-0613": 8192,
    "gpt-4-32k": 8192,
    "gpt-4-turbo": 4096,
    "gpt-4-1106": 4096,
    "gpt-4-0125": 4096,
    "gpt-4o": 16384,
    "gpt-4o-mini": 16384,
    "gpt-5": 32768,
    "o1": 32768,
    "o3": 32768,
    // GPT-3.5 variants
    "gpt-3.5-turbo": 4096,
    // Gemini models
    "gemini-3-pro": 8192,
    "gemini-3-flash": 8192,
    "gemini-2": 8192,
    "gemini-1.5-pro": 8192,
    "gemini-1.5-flash": 8192,
    // DeepSeek models
    "deepseek-v3": 8192,
    "deepseek-r1": 8192,
    // Default (conservative)
    "default": 4096,
};
/**
 * Get the context length for a model, with fallback to default
 */
function getModelContextLength(model) {
    // Check for exact match first
    if (MODEL_CONTEXT_LENGTHS[model]) {
        return MODEL_CONTEXT_LENGTHS[model];
    }
    // Check for prefix matches (e.g., "gpt-4o-2024-05-13" matches "gpt-4o")
    for (const [key, value] of Object.entries(MODEL_CONTEXT_LENGTHS)) {
        if (key !== "default" && model.startsWith(key)) {
            return value;
        }
    }
    return MODEL_CONTEXT_LENGTHS["default"];
}
/**
 * Get the max output tokens for a model, with fallback to default
 * Handles both direct model names and OpenRouter-style names (provider/model)
 */
function getModelMaxOutputTokens(model) {
    // Normalize model name: remove provider prefix if present (e.g., "anthropic/claude-3-5-haiku" -> "claude-3-5-haiku")
    const normalizedModel = model.includes("/") ? model.split("/").pop() : model;
    // Check for exact match first
    if (MODEL_MAX_OUTPUT_TOKENS[normalizedModel]) {
        return MODEL_MAX_OUTPUT_TOKENS[normalizedModel];
    }
    // Check for prefix matches (e.g., "claude-3-5-haiku-20241022" matches "claude-3-5-haiku")
    for (const [key, value] of Object.entries(MODEL_MAX_OUTPUT_TOKENS)) {
        if (key !== "default" && normalizedModel.startsWith(key)) {
            return value;
        }
    }
    return MODEL_MAX_OUTPUT_TOKENS["default"];
}
/**
 * Cap max_tokens to the model's output limit
 * Returns the capped value and logs if capping occurred
 */
function capMaxTokensToModelLimit(model, requestedMaxTokens) {
    const modelLimit = getModelMaxOutputTokens(model);
    if (requestedMaxTokens > modelLimit) {
        console.log(`[LLMProviderService] Capping max_tokens for ${model}: requested ${requestedMaxTokens}, model limit ${modelLimit}`);
        return modelLimit;
    }
    return requestedMaxTokens;
}
/**
 * Extract max output tokens limit from provider error messages
 * Supports multiple provider error formats for auto-discovery of limits
 *
 * @param provider - The LLM provider name
 * @param error - The error object or message string
 * @returns TokenLimitError if limit was extracted, null otherwise
 */
function extractMaxOutputTokensFromError(provider, error) {
    const errorMessage = typeof error === "string" ? error : error.message;
    // Anthropic format: "max_tokens: 10240 > 8192, which is the maximum..."
    const anthropicMatch = errorMessage.match(/max_tokens:\s*(\d+)\s*>\s*(\d+)/i);
    if (anthropicMatch) {
        return {
            requested: parseInt(anthropicMatch[1]),
            allowed: parseInt(anthropicMatch[2]),
            provider,
        };
    }
    // OpenAI format: "maximum context length is X tokens... you requested Y"
    // Also handles: "This model's maximum context length is X tokens, however you requested Y tokens"
    const openaiContextMatch = errorMessage.match(/maximum.*?context.*?(\d+)\s*tokens.*requested\s*(\d+)/i);
    if (openaiContextMatch) {
        return {
            requested: parseInt(openaiContextMatch[2]),
            allowed: parseInt(openaiContextMatch[1]),
            provider,
        };
    }
    // OpenAI max_tokens format: "max_tokens is too large: X. This model supports at most Y"
    const openaiMaxTokensMatch = errorMessage.match(/max_tokens.*?too large:\s*(\d+).*supports.*?(\d+)/i);
    if (openaiMaxTokensMatch) {
        return {
            requested: parseInt(openaiMaxTokensMatch[1]),
            allowed: parseInt(openaiMaxTokensMatch[2]),
            provider,
        };
    }
    // Gemini format: "maxOutputTokens must be <= X"
    const geminiMatch = errorMessage.match(/maxOutputTokens.*?<=\s*(\d+)/i);
    if (geminiMatch) {
        return {
            requested: 0,
            allowed: parseInt(geminiMatch[1]),
            provider,
        };
    }
    // DeepSeek format (similar to OpenAI): "max_tokens exceeds maximum of X"
    const deepseekMatch = errorMessage.match(/max_tokens.*?maximum.*?(\d+)/i);
    if (deepseekMatch) {
        return {
            requested: 0,
            allowed: parseInt(deepseekMatch[1]),
            provider,
        };
    }
    // Generic format: "exceeds the maximum of X tokens"
    const genericMatch = errorMessage.match(/exceeds.*?maximum.*?(\d+)\s*tokens/i);
    if (genericMatch) {
        return {
            requested: 0,
            allowed: parseInt(genericMatch[1]),
            provider,
        };
    }
    return null;
}
/**
 * In-memory cache for discovered token limits
 * Persists limits to Redis if available for cross-instance sharing
 */
class TokenLimitCache {
    memoryCache = new Map();
    redisClient = null;
    static instance = null;
    constructor() { }
    static getInstance() {
        if (!TokenLimitCache.instance) {
            TokenLimitCache.instance = new TokenLimitCache();
        }
        return TokenLimitCache.instance;
    }
    /**
     * Set Redis client for persistent caching
     */
    setRedisClient(client) {
        this.redisClient = client;
    }
    /**
     * Get cached token limit for a model
     * Checks memory first, then Redis if available
     */
    async get(model) {
        const normalizedModel = this.normalizeModelName(model);
        if (this.memoryCache.has(normalizedModel)) {
            return this.memoryCache.get(normalizedModel);
        }
        if (this.redisClient) {
            try {
                const cached = await this.redisClient.get(`token_limit:${normalizedModel}`);
                if (cached) {
                    const limit = parseInt(cached);
                    this.memoryCache.set(normalizedModel, limit);
                    return limit;
                }
            }
            catch (error) {
                console.warn("[TokenLimitCache] Redis get failed:", error);
            }
        }
        return null;
    }
    /**
     * Cache a discovered token limit
     * Stores in memory and Redis (with 7-day TTL)
     */
    async set(model, limit) {
        const normalizedModel = this.normalizeModelName(model);
        this.memoryCache.set(normalizedModel, limit);
        console.log(`[TokenLimitCache] Discovered limit for ${normalizedModel}: ${limit}`);
        if (this.redisClient) {
            try {
                const ttl = 7 * 24 * 60 * 60;
                await this.redisClient.setex(`token_limit:${normalizedModel}`, ttl, limit.toString());
            }
            catch (error) {
                console.warn("[TokenLimitCache] Redis set failed:", error);
            }
        }
    }
    /**
     * Normalize model name for consistent caching
     */
    normalizeModelName(model) {
        return model.includes("/") ? model.split("/").pop() : model;
    }
    /**
     * Clear the cache (useful for testing)
     */
    clear() {
        this.memoryCache.clear();
    }
}
exports.TokenLimitCache = TokenLimitCache;
let LLMProviderService = class LLMProviderService {
    static { LLMProviderService_1 = this; }
    /**
     * Create a chat completion using the specified provider
     *
     * @param options - Completion options including messages, model, provider, and API key
     * @returns Unified LLM response
     */
    async createCompletion(options) {
        const startTime = Date.now();
        console.log(`[LLMProviderService] Starting ${options.provider} completion with model ${options.model}`);
        let response;
        try {
            switch (options.provider) {
                case LLMModels_1.LLMProvider.OPENAI:
                    response = await this.openAICompletion(options);
                    break;
                case LLMModels_1.LLMProvider.ANTHROPIC:
                    response = await this.anthropicCompletion(options);
                    break;
                case LLMModels_1.LLMProvider.GEMINI:
                    response = await this.geminiCompletion(options);
                    break;
                case LLMModels_1.LLMProvider.OPENROUTER:
                    response = await this.openRouterCompletion(options);
                    break;
                case LLMModels_1.LLMProvider.DEEPSEEK:
                    response = await this.deepSeekCompletion(options);
                    break;
                case LLMModels_1.LLMProvider.VENICE:
                    response = await this.veniceCompletion(options);
                    break;
                default:
                    throw new Error(`Unsupported provider: ${options.provider}`);
            }
            response.latencyMs = Date.now() - startTime;
            console.log(`[LLMProviderService] ${options.provider} completion finished in ${response.latencyMs}ms, tokens: ${response.usage?.totalTokens ?? 0}`);
            return response;
        }
        catch (error) {
            const elapsed = Date.now() - startTime;
            console.error(`[LLMProviderService] ${options.provider} completion failed after ${elapsed}ms:`, error instanceof Error ? error.message : error);
            throw error;
        }
    }
    /**
     * Common placeholder keys that should be rejected
     */
    static PLACEHOLDER_KEYS = [
        "test-key",
        "your-api-key",
        "api-key-here",
        "placeholder",
        "xxx",
    ];
    /**
     * Get API key with fallback to environment variable
     * BYOK (Bring Your Own Key) takes precedence over env fallback
     *
     * Security: API keys are never logged or included in error messages
     */
    getApiKey(provider, requestApiKey) {
        // Trim and validate request API key (BYOK)
        const trimmedKey = requestApiKey?.trim();
        if (trimmedKey && trimmedKey.length > 10) {
            // Reject common placeholder keys (case-insensitive)
            const lowerKey = trimmedKey.toLowerCase();
            const isPlaceholder = LLMProviderService_1.PLACEHOLDER_KEYS.some((placeholder) => lowerKey === placeholder || lowerKey.includes(placeholder));
            if (!isPlaceholder) {
                return trimmedKey;
            }
        }
        // Fallback to environment variables
        const envKeys = {
            [LLMModels_1.LLMProvider.OPENAI]: process.env.OPENAI_API_KEY,
            [LLMModels_1.LLMProvider.ANTHROPIC]: process.env.ANTHROPIC_API_KEY,
            [LLMModels_1.LLMProvider.GEMINI]: process.env.GOOGLE_API_KEY,
            [LLMModels_1.LLMProvider.OPENROUTER]: process.env.OPENROUTER_API_KEY,
            [LLMModels_1.LLMProvider.DEEPSEEK]: process.env.DEEPSEEK_API_KEY,
            [LLMModels_1.LLMProvider.VENICE]: process.env.VENICE_API_KEY,
        };
        const envKey = envKeys[provider];
        if (envKey) {
            return envKey;
        }
        throw new Error(`No API key provided for ${provider}. Either pass apiKey in request or set environment variable.`);
    }
    /**
     * OpenAI completion
     */
    async openAICompletion(options) {
        const apiKey = this.getApiKey(LLMModels_1.LLMProvider.OPENAI, options.apiKey);
        const client = new openai_1.default({
            apiKey,
            baseURL: PROVIDER_BASE_URLS.openai,
            timeout: 120000, // 2 minute timeout
        });
        const requestParams = {
            model: options.model,
            messages: this.formatMessagesForOpenAI(options.messages),
            temperature: options.temperature ?? 0.7,
        };
        if (options.maxTokens) {
            // Get model context length and cap max_tokens to leave room for prompt
            // Estimate prompt tokens (rough estimate: 4 chars per token)
            const estimatedPromptTokens = Math.ceil(options.messages.reduce((acc, msg) => acc + msg.content.length, 0) / 4);
            const modelContextLength = getModelContextLength(options.model);
            // Leave at least 500 tokens buffer for safety, and ensure we don't exceed context
            const maxAllowedTokens = Math.max(500, modelContextLength - estimatedPromptTokens - 500);
            const cappedMaxTokens = Math.min(options.maxTokens, maxAllowedTokens);
            console.log(`[LLMProviderService] Model ${options.model} context: ${modelContextLength}, estimated prompt: ${estimatedPromptTokens}, requested: ${options.maxTokens}, capped to: ${cappedMaxTokens}`);
            // Newer models (gpt-5.x, o1, o3) use max_completion_tokens instead of max_tokens
            const usesNewTokenParam = options.model.startsWith("gpt-5") ||
                options.model.startsWith("o1") ||
                options.model.startsWith("o3");
            if (usesNewTokenParam) {
                requestParams.max_completion_tokens = cappedMaxTokens;
            }
            else {
                requestParams.max_tokens = cappedMaxTokens;
            }
        }
        // Only add response_format for models that support it
        // gpt-4-0613 and older models don't support response_format
        const supportsJsonMode = options.model.includes("turbo") ||
            options.model.includes("gpt-4o") ||
            options.model.includes("gpt-4-1106") ||
            options.model.includes("gpt-4-0125") ||
            options.model.includes("gpt-3.5-turbo-1106") ||
            options.model.startsWith("gpt-5") ||
            options.model.startsWith("o1") ||
            options.model.startsWith("o3");
        if (options.responseFormat?.type === "json_object" && supportsJsonMode) {
            requestParams.response_format = { type: "json_object" };
        }
        const response = await client.chat.completions.create(requestParams);
        return {
            content: response.choices[0]?.message?.content ?? "",
            model: options.model,
            provider: LLMModels_1.LLMProvider.OPENAI,
            usage: {
                promptTokens: response.usage?.prompt_tokens ?? 0,
                completionTokens: response.usage?.completion_tokens ?? 0,
                totalTokens: response.usage?.total_tokens ?? 0,
            },
            finishReason: response.choices[0]?.finish_reason ?? "stop",
        };
    }
    /**
     * Anthropic Claude completion
     */
    async anthropicCompletion(options) {
        const apiKey = this.getApiKey(LLMModels_1.LLMProvider.ANTHROPIC, options.apiKey);
        const client = new sdk_1.default({
            apiKey,
            timeout: 120000, // 2 minute timeout
        });
        // Extract system message
        let systemMessage = "";
        const chatMessages = [];
        for (const msg of options.messages) {
            if (msg.role === LLMModels_1.MessageRole.SYSTEM) {
                systemMessage = msg.content;
            }
            else {
                chatMessages.push({
                    role: msg.role === LLMModels_1.MessageRole.USER ? "user" : "assistant",
                    content: msg.content,
                });
            }
        }
        // Add JSON instruction if response_format is json
        if (options.responseFormat?.type === "json_object") {
            systemMessage += "\n\nYou MUST respond with valid JSON only, no other text.";
        }
        // Cap max_tokens to model's output limit to prevent "max_tokens exceeds model limit" errors
        const requestedMaxTokens = options.maxTokens ?? 4096;
        const cappedMaxTokens = capMaxTokensToModelLimit(options.model, requestedMaxTokens);
        const response = await client.messages.create({
            model: options.model,
            max_tokens: cappedMaxTokens,
            system: systemMessage,
            messages: chatMessages,
            temperature: options.temperature ?? 0.7,
        });
        const content = response.content[0]?.type === "text"
            ? response.content[0].text
            : "";
        return {
            content,
            model: options.model,
            provider: LLMModels_1.LLMProvider.ANTHROPIC,
            usage: {
                promptTokens: response.usage?.input_tokens ?? 0,
                completionTokens: response.usage?.output_tokens ?? 0,
                totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
            },
            finishReason: response.stop_reason ?? "stop",
        };
    }
    /**
     * Google Gemini completion
     */
    async geminiCompletion(options) {
        const apiKey = this.getApiKey(LLMModels_1.LLMProvider.GEMINI, options.apiKey);
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: options.model });
        // Build prompt from messages
        let systemContent = "";
        let userContent = "";
        for (const msg of options.messages) {
            if (msg.role === LLMModels_1.MessageRole.SYSTEM) {
                systemContent = msg.content;
            }
            else if (msg.role === LLMModels_1.MessageRole.USER) {
                userContent = msg.content;
            }
            else if (msg.role === LLMModels_1.MessageRole.ASSISTANT) {
                userContent += `\n\nAssistant: ${msg.content}`;
            }
        }
        let fullPrompt = `${systemContent}\n\n---\n\n${userContent}`;
        // Add JSON instruction if response_format is json
        if (options.responseFormat?.type === "json_object") {
            fullPrompt += "\n\nYou MUST respond with valid JSON only, no other text.";
        }
        // Cap maxOutputTokens to model's output limit
        const cappedMaxTokens = options.maxTokens
            ? capMaxTokensToModelLimit(options.model, options.maxTokens)
            : undefined;
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: cappedMaxTokens,
            },
        });
        const response = result.response;
        const content = response.text() ?? "";
        return {
            content,
            model: options.model,
            provider: LLMModels_1.LLMProvider.GEMINI,
            usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            },
            finishReason: "stop",
        };
    }
    /**
     * OpenRouter completion (OpenAI-compatible API)
     */
    async openRouterCompletion(options) {
        const apiKey = this.getApiKey(LLMModels_1.LLMProvider.OPENROUTER, options.apiKey);
        const client = new openai_1.default({
            apiKey,
            baseURL: PROVIDER_BASE_URLS.openrouter,
            timeout: 120000, // 2 minute timeout
            defaultHeaders: {
                "HTTP-Referer": "https://manoe.iliashalkin.com",
                "X-Title": "MANOE",
            },
        });
        const requestParams = {
            model: options.model,
            messages: this.formatMessagesForOpenAI(options.messages),
            temperature: options.temperature ?? 0.7,
        };
        if (options.maxTokens) {
            // Cap max_tokens to model's output limit
            requestParams.max_tokens = capMaxTokensToModelLimit(options.model, options.maxTokens);
        }
        if (options.responseFormat?.type === "json_object") {
            requestParams.response_format = { type: "json_object" };
        }
        const response = await client.chat.completions.create(requestParams);
        return {
            content: response.choices[0]?.message?.content ?? "",
            model: options.model,
            provider: LLMModels_1.LLMProvider.OPENROUTER,
            usage: {
                promptTokens: response.usage?.prompt_tokens ?? 0,
                completionTokens: response.usage?.completion_tokens ?? 0,
                totalTokens: response.usage?.total_tokens ?? 0,
            },
            finishReason: response.choices[0]?.finish_reason ?? "stop",
        };
    }
    /**
     * DeepSeek completion (OpenAI-compatible API)
     */
    async deepSeekCompletion(options) {
        const apiKey = this.getApiKey(LLMModels_1.LLMProvider.DEEPSEEK, options.apiKey);
        const client = new openai_1.default({
            apiKey,
            baseURL: PROVIDER_BASE_URLS.deepseek,
            timeout: 120000, // 2 minute timeout
        });
        const requestParams = {
            model: options.model,
            messages: this.formatMessagesForOpenAI(options.messages),
            temperature: options.temperature ?? 0.7,
        };
        if (options.maxTokens) {
            // Cap max_tokens to model's output limit
            requestParams.max_tokens = capMaxTokensToModelLimit(options.model, options.maxTokens);
        }
        if (options.responseFormat?.type === "json_object") {
            requestParams.response_format = { type: "json_object" };
        }
        const response = await client.chat.completions.create(requestParams);
        return {
            content: response.choices[0]?.message?.content ?? "",
            model: options.model,
            provider: LLMModels_1.LLMProvider.DEEPSEEK,
            usage: {
                promptTokens: response.usage?.prompt_tokens ?? 0,
                completionTokens: response.usage?.completion_tokens ?? 0,
                totalTokens: response.usage?.total_tokens ?? 0,
            },
            finishReason: response.choices[0]?.finish_reason ?? "stop",
        };
    }
    /**
     * Venice AI completion (OpenAI-compatible API)
     */
    async veniceCompletion(options) {
        const apiKey = this.getApiKey(LLMModels_1.LLMProvider.VENICE, options.apiKey);
        const client = new openai_1.default({
            apiKey,
            baseURL: PROVIDER_BASE_URLS.venice,
            timeout: 120000, // 2 minute timeout
        });
        const requestParams = {
            model: options.model,
            messages: this.formatMessagesForOpenAI(options.messages),
            temperature: options.temperature ?? 0.7,
        };
        if (options.maxTokens) {
            // Cap max_tokens to model's output limit
            requestParams.max_tokens = capMaxTokensToModelLimit(options.model, options.maxTokens);
        }
        if (options.responseFormat?.type === "json_object") {
            requestParams.response_format = { type: "json_object" };
        }
        const response = await client.chat.completions.create(requestParams);
        return {
            content: response.choices[0]?.message?.content ?? "",
            model: options.model,
            provider: LLMModels_1.LLMProvider.VENICE,
            usage: {
                promptTokens: response.usage?.prompt_tokens ?? 0,
                completionTokens: response.usage?.completion_tokens ?? 0,
                totalTokens: response.usage?.total_tokens ?? 0,
            },
            finishReason: response.choices[0]?.finish_reason ?? "stop",
        };
    }
    /**
     * Format messages for OpenAI-compatible APIs
     */
    formatMessagesForOpenAI(messages) {
        return messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));
    }
    /**
     * Check if an error is retryable (rate limit, server error, timeout)
     */
    isRetryableError(error) {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            // Rate limit errors
            if (message.includes("rate limit") || message.includes("429")) {
                return true;
            }
            // Server errors
            if (message.includes("500") || message.includes("502") ||
                message.includes("503") || message.includes("504")) {
                return true;
            }
            // Timeout errors
            if (message.includes("timeout") || message.includes("timed out")) {
                return true;
            }
        }
        return false;
    }
    /**
     * Check if an error is a token limit error that can be retried with a lower limit
     */
    isTokenLimitError(error) {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return (message.includes("max_tokens") ||
                message.includes("maximum context") ||
                message.includes("maxoutputtokens") ||
                message.includes("exceeds") && message.includes("token"));
        }
        return false;
    }
    /**
     * Create completion with automatic retry for transient errors
     * Also handles token limit errors with auto-discovery and caching
     */
    async createCompletionWithRetry(options, maxRetries = 3, baseDelayMs = 1000) {
        let lastError = null;
        const tokenLimitCache = TokenLimitCache.getInstance();
        let tokenLimitRetried = false;
        const cachedLimit = await tokenLimitCache.get(options.model);
        if (cachedLimit && options.maxTokens && options.maxTokens > cachedLimit) {
            console.log(`[LLMProviderService] Using cached limit for ${options.model}: ${cachedLimit}`);
            options = { ...options, maxTokens: cachedLimit };
        }
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.createCompletion(options);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (this.isTokenLimitError(error) && !tokenLimitRetried) {
                    const limitError = extractMaxOutputTokensFromError(options.provider, lastError);
                    if (limitError) {
                        await tokenLimitCache.set(options.model, limitError.allowed);
                        console.log(`[LLMProviderService] Retrying with discovered limit: ${limitError.allowed}`);
                        options = { ...options, maxTokens: limitError.allowed };
                        tokenLimitRetried = true;
                        continue;
                    }
                }
                if (!this.isRetryableError(error) || attempt === maxRetries - 1) {
                    throw lastError;
                }
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        throw lastError ?? new Error("Max retries exceeded");
    }
};
exports.LLMProviderService = LLMProviderService;
exports.LLMProviderService = LLMProviderService = LLMProviderService_1 = __decorate([
    (0, di_1.Service)()
], LLMProviderService);
//# sourceMappingURL=LLMProviderService.js.map