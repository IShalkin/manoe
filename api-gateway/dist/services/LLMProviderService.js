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
exports.LLMProviderService = void 0;
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
        const response = await client.messages.create({
            model: options.model,
            max_tokens: options.maxTokens ?? 4096,
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
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens,
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
            requestParams.max_tokens = options.maxTokens;
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
            requestParams.max_tokens = options.maxTokens;
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
            requestParams.max_tokens = options.maxTokens;
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
     * Create completion with automatic retry for transient errors
     */
    async createCompletionWithRetry(options, maxRetries = 3, baseDelayMs = 1000) {
        let lastError = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.createCompletion(options);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (!this.isRetryableError(error) || attempt === maxRetries - 1) {
                    throw lastError;
                }
                // Exponential backoff
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