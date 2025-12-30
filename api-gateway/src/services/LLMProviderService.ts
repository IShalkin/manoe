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

import { Service } from "@tsed/di";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  LLMProvider,
  LLMResponse,
  CompletionOptions,
  ChatMessage,
  MessageRole,
  TokenUsage,
} from "../models/LLMModels";

/**
 * Provider base URLs
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1",
  venice: "https://api.venice.ai/api/v1",
};

/**
 * Model context length limits (total tokens including prompt + completion)
 * Used to cap max_tokens to avoid exceeding model limits
 */
const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
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
 * Models that do NOT support the temperature parameter
 * These models only accept temperature=1 (default) or no temperature at all
 * Includes OpenAI reasoning models (o1, o3 series) and some provider-specific models
 */
/**
 * Known models that do NOT support the temperature parameter
 * This is a static list for common models - runtime discovery handles unknown models
 */
const KNOWN_MODELS_WITHOUT_TEMPERATURE: string[] = [
  // OpenAI reasoning models
  "o1",
  "o1-mini",
  "o1-preview",
  "o3",
  "o3-mini",
  // OpenRouter variants
  "openai/o1",
  "openai/o1-mini",
  "openai/o1-preview",
  "openai/o3",
  "openai/o3-mini",
];

/**
 * Runtime cache for models discovered to not support temperature
 * This allows the system to learn about new models without code changes
 */
class TemperatureSupportCache {
  private static instance: TemperatureSupportCache;
  private modelsWithoutTemperature: Set<string> = new Set();

  static getInstance(): TemperatureSupportCache {
    if (!TemperatureSupportCache.instance) {
      TemperatureSupportCache.instance = new TemperatureSupportCache();
    }
    return TemperatureSupportCache.instance;
  }

  /**
   * Check if a model is known to not support temperature
   */
  doesNotSupportTemperature(model: string): boolean {
    return this.modelsWithoutTemperature.has(model.toLowerCase());
  }

  /**
   * Mark a model as not supporting temperature (discovered at runtime)
   */
  markAsNoTemperatureSupport(model: string): void {
    const normalizedModel = model.toLowerCase();
    this.modelsWithoutTemperature.add(normalizedModel);
    console.log(`[TemperatureSupportCache] Learned that model "${model}" does not support temperature parameter`);
  }

  /**
   * Get all models known to not support temperature
   */
  getModelsWithoutTemperature(): string[] {
    return Array.from(this.modelsWithoutTemperature);
  }
}

/**
 * Check if a model supports the temperature parameter
 * Uses both static list and runtime-discovered cache
 * Returns false for reasoning models that only accept default temperature
 */
function modelSupportsTemperature(model: string): boolean {
  const normalizedModel = model.toLowerCase();
  const cache = TemperatureSupportCache.getInstance();
  
  // Check runtime cache first (learned from previous errors)
  if (cache.doesNotSupportTemperature(normalizedModel)) {
    return false;
  }
  
  // Check static list of known models
  if (KNOWN_MODELS_WITHOUT_TEMPERATURE.some(m => normalizedModel === m.toLowerCase())) {
    return false;
  }
  
  // Check prefix patterns for o1/o3 series (catches o1-2024-12-17, etc.)
  if (normalizedModel.match(/^(openai\/)?(o1|o3)(-|$)/)) {
    return false;
  }
  
  return true;
}

/**
 * Check if an error is a temperature-related unsupported parameter error
 */
function isTemperatureUnsupportedError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      (message.includes("temperature") && message.includes("unsupported")) ||
      (message.includes("temperature") && message.includes("does not support")) ||
      (message.includes("temperature") && message.includes("only") && message.includes("default"))
    );
  }
  return false;
}

/**
 * Model max OUTPUT token limits (completion tokens only)
 * Different from context length - this is the max tokens the model can generate
 * Used to prevent "max_tokens exceeds model limit" errors
 */
const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
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
function getModelContextLength(model: string): number {
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
function getModelMaxOutputTokens(model: string): number {
  // Normalize model name: remove provider prefix if present (e.g., "anthropic/claude-3-5-haiku" -> "claude-3-5-haiku")
  const normalizedModel = model.includes("/") ? model.split("/").pop()! : model;
  
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
function capMaxTokensToModelLimit(model: string, requestedMaxTokens: number): number {
  const modelLimit = getModelMaxOutputTokens(model);
  if (requestedMaxTokens > modelLimit) {
    console.log(`[LLMProviderService] Capping max_tokens for ${model}: requested ${requestedMaxTokens}, model limit ${modelLimit}`);
    return modelLimit;
  }
  return requestedMaxTokens;
}

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
export function extractMaxOutputTokensFromError(
  provider: string,
  error: Error | string
): TokenLimitError | null {
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
  const openaiContextMatch = errorMessage.match(
    /maximum.*?context.*?(\d+)\s*tokens.*requested\s*(\d+)/i
  );
  if (openaiContextMatch) {
    return {
      requested: parseInt(openaiContextMatch[2]),
      allowed: parseInt(openaiContextMatch[1]),
      provider,
    };
  }

  // OpenAI max_tokens format: "max_tokens is too large: X. This model supports at most Y"
  const openaiMaxTokensMatch = errorMessage.match(
    /max_tokens.*?too large:\s*(\d+).*supports.*?(\d+)/i
  );
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
export class TokenLimitCache {
  private memoryCache: Map<string, number> = new Map();
  private redisClient: { get: (key: string) => Promise<string | null>; setex: (key: string, ttl: number, value: string) => Promise<unknown> } | null = null;
  private static instance: TokenLimitCache | null = null;

  private constructor() {}

  static getInstance(): TokenLimitCache {
    if (!TokenLimitCache.instance) {
      TokenLimitCache.instance = new TokenLimitCache();
    }
    return TokenLimitCache.instance;
  }

  /**
   * Set Redis client for persistent caching
   */
  setRedisClient(client: { get: (key: string) => Promise<string | null>; setex: (key: string, ttl: number, value: string) => Promise<unknown> }): void {
    this.redisClient = client;
  }

  /**
   * Get cached token limit for a model
   * Checks memory first, then Redis if available
   */
  async get(model: string): Promise<number | null> {
    const normalizedModel = this.normalizeModelName(model);

    if (this.memoryCache.has(normalizedModel)) {
      return this.memoryCache.get(normalizedModel)!;
    }

    if (this.redisClient) {
      try {
        const cached = await this.redisClient.get(`token_limit:${normalizedModel}`);
        if (cached) {
          const limit = parseInt(cached);
          this.memoryCache.set(normalizedModel, limit);
          return limit;
        }
      } catch (error) {
        console.warn("[TokenLimitCache] Redis get failed:", error);
      }
    }

    return null;
  }

  /**
   * Cache a discovered token limit
   * Stores in memory and Redis (with 7-day TTL)
   */
  async set(model: string, limit: number): Promise<void> {
    const normalizedModel = this.normalizeModelName(model);
    this.memoryCache.set(normalizedModel, limit);
    console.log(`[TokenLimitCache] Discovered limit for ${normalizedModel}: ${limit}`);

    if (this.redisClient) {
      try {
        const ttl = 7 * 24 * 60 * 60;
        await this.redisClient.setex(`token_limit:${normalizedModel}`, ttl, limit.toString());
      } catch (error) {
        console.warn("[TokenLimitCache] Redis set failed:", error);
      }
    }
  }

  /**
   * Normalize model name for consistent caching
   */
  private normalizeModelName(model: string): string {
    return model.includes("/") ? model.split("/").pop()! : model;
  }

  /**
   * Clear the cache (useful for testing)
   */
  clear(): void {
    this.memoryCache.clear();
  }
}

@Service()
export class LLMProviderService {
  /**
   * Create a chat completion using the specified provider
   * 
   * @param options - Completion options including messages, model, provider, and API key
   * @returns Unified LLM response
   */
  async createCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`[LLMProviderService] Starting ${options.provider} completion with model ${options.model}`);

    let response: LLMResponse;

    try {
      switch (options.provider) {
        case LLMProvider.OPENAI:
          response = await this.openAICompletion(options);
          break;
        case LLMProvider.ANTHROPIC:
          response = await this.anthropicCompletion(options);
          break;
        case LLMProvider.GEMINI:
          response = await this.geminiCompletion(options);
          break;
        case LLMProvider.OPENROUTER:
          response = await this.openRouterCompletion(options);
          break;
        case LLMProvider.DEEPSEEK:
          response = await this.deepSeekCompletion(options);
          break;
        case LLMProvider.VENICE:
          response = await this.veniceCompletion(options);
          break;
        default:
          throw new Error(`Unsupported provider: ${options.provider}`);
      }

      response.latencyMs = Date.now() - startTime;
      console.log(`[LLMProviderService] ${options.provider} completion finished in ${response.latencyMs}ms, tokens: ${response.usage?.totalTokens ?? 0}`);
      return response;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[LLMProviderService] ${options.provider} completion failed after ${elapsed}ms:`, error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Common placeholder keys that should be rejected
   */
  private static readonly PLACEHOLDER_KEYS = [
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
  private getApiKey(provider: LLMProvider, requestApiKey?: string): string {
    // Trim and validate request API key (BYOK)
    const trimmedKey = requestApiKey?.trim();
    if (trimmedKey && trimmedKey.length > 10) {
      // Reject common placeholder keys (case-insensitive)
      const lowerKey = trimmedKey.toLowerCase();
      const isPlaceholder = LLMProviderService.PLACEHOLDER_KEYS.some(
        (placeholder) => lowerKey === placeholder || lowerKey.includes(placeholder)
      );
      if (!isPlaceholder) {
        return trimmedKey;
      }
    }

    // Fallback to environment variables
    const envKeys: Record<string, string | undefined> = {
      [LLMProvider.OPENAI]: process.env.OPENAI_API_KEY,
      [LLMProvider.ANTHROPIC]: process.env.ANTHROPIC_API_KEY,
      [LLMProvider.GEMINI]: process.env.GOOGLE_API_KEY,
      [LLMProvider.OPENROUTER]: process.env.OPENROUTER_API_KEY,
      [LLMProvider.DEEPSEEK]: process.env.DEEPSEEK_API_KEY,
      [LLMProvider.VENICE]: process.env.VENICE_API_KEY,
    };

    const envKey = envKeys[provider];
    if (envKey) {
      return envKey;
    }

    throw new Error(
      `No API key provided for ${provider}. Either pass apiKey in request or set environment variable.`
    );
  }

  /**
   * OpenAI completion
   */
  private async openAICompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.OPENAI, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.openai,
      timeout: 120000, // 2 minute timeout
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
    };

    // Only include temperature for models that support it
    // Reasoning models (o1, o3 series) don't support temperature parameter
    if (modelSupportsTemperature(options.model)) {
      requestParams.temperature = options.temperature ?? 0.7;
    } else {
      console.log(`[LLMProviderService] Model ${options.model} does not support temperature, omitting parameter`);
    }

    if (options.maxTokens) {
      // Get model context length and cap max_tokens to leave room for prompt
      // Estimate prompt tokens (rough estimate: 4 chars per token)
      const estimatedPromptTokens = Math.ceil(
        options.messages.reduce((acc, msg) => acc + msg.content.length, 0) / 4
      );
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
        (requestParams as unknown as Record<string, unknown>).max_completion_tokens = cappedMaxTokens;
      } else {
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
      provider: LLMProvider.OPENAI,
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
  private async anthropicCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.ANTHROPIC, options.apiKey);
    const client = new Anthropic({
      apiKey,
      timeout: 120000, // 2 minute timeout
    });

    // Extract system message
    let systemMessage = "";
    const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of options.messages) {
      if (msg.role === MessageRole.SYSTEM) {
        systemMessage = msg.content;
      } else {
        chatMessages.push({
          role: msg.role === MessageRole.USER ? "user" : "assistant",
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

    // Build request options - only include temperature for models that support it
    const requestOptions: Anthropic.MessageCreateParams = {
      model: options.model,
      max_tokens: cappedMaxTokens,
      system: systemMessage,
      messages: chatMessages,
    };

    if (modelSupportsTemperature(options.model)) {
      requestOptions.temperature = options.temperature ?? 0.7;
    } else {
      console.log(`[LLMProviderService] Model ${options.model} does not support temperature, omitting parameter`);
    }

    const response = await client.messages.create(requestOptions);

    const content = response.content[0]?.type === "text" 
      ? response.content[0].text 
      : "";

    return {
      content,
      model: options.model,
      provider: LLMProvider.ANTHROPIC,
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
  private async geminiCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.GEMINI, options.apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: options.model });

    // Build prompt from messages
    let systemContent = "";
    let userContent = "";

    for (const msg of options.messages) {
      if (msg.role === MessageRole.SYSTEM) {
        systemContent = msg.content;
      } else if (msg.role === MessageRole.USER) {
        userContent = msg.content;
      } else if (msg.role === MessageRole.ASSISTANT) {
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

    // Build generation config - only include temperature for models that support it
    const generationConfig: { temperature?: number; maxOutputTokens?: number } = {
      maxOutputTokens: cappedMaxTokens,
    };

    if (modelSupportsTemperature(options.model)) {
      generationConfig.temperature = options.temperature ?? 0.7;
    } else {
      console.log(`[LLMProviderService] Model ${options.model} does not support temperature, omitting parameter`);
    }

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig,
    });

    const response = result.response;
    const content = response.text() ?? "";

    return {
      content,
      model: options.model,
      provider: LLMProvider.GEMINI,
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
  private async openRouterCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.OPENROUTER, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.openrouter,
      timeout: 120000, // 2 minute timeout
      defaultHeaders: {
        "HTTP-Referer": "https://manoe.iliashalkin.com",
        "X-Title": "MANOE",
      },
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
    };

    // Only include temperature for models that support it
    if (modelSupportsTemperature(options.model)) {
      requestParams.temperature = options.temperature ?? 0.7;
    } else {
      console.log(`[LLMProviderService] Model ${options.model} does not support temperature, omitting parameter`);
    }

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
      provider: LLMProvider.OPENROUTER,
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
  private async deepSeekCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.DEEPSEEK, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.deepseek,
      timeout: 120000, // 2 minute timeout
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
    };

    // Only include temperature for models that support it
    if (modelSupportsTemperature(options.model)) {
      requestParams.temperature = options.temperature ?? 0.7;
    } else {
      console.log(`[LLMProviderService] Model ${options.model} does not support temperature, omitting parameter`);
    }

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
      provider: LLMProvider.DEEPSEEK,
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
  private async veniceCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.VENICE, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.venice,
      timeout: 120000, // 2 minute timeout
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
    };

    // Only include temperature for models that support it
    if (modelSupportsTemperature(options.model)) {
      requestParams.temperature = options.temperature ?? 0.7;
    } else {
      console.log(`[LLMProviderService] Model ${options.model} does not support temperature, omitting parameter`);
    }

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
      provider: LLMProvider.VENICE,
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
  private formatMessagesForOpenAI(
    messages: ChatMessage[]
  ): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => ({
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
    }));
  }

  /**
   * Check if an error is retryable (rate limit, server error, timeout)
   */
  isRetryableError(error: unknown): boolean {
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
  private isTokenLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("max_tokens") ||
        message.includes("maximum context") ||
        message.includes("maxoutputtokens") ||
        message.includes("exceeds") && message.includes("token")
      );
    }
    return false;
  }

  /**
   * Create completion with automatic retry for transient errors
   * Also handles token limit errors and temperature unsupported errors with auto-discovery and caching
   */
  async createCompletionWithRetry(
    options: CompletionOptions,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<LLMResponse> {
    let lastError: Error | null = null;
    const tokenLimitCache = TokenLimitCache.getInstance();
    const temperatureCache = TemperatureSupportCache.getInstance();
    let tokenLimitRetried = false;
    let temperatureRetried = false;

    const cachedLimit = await tokenLimitCache.get(options.model);
    if (cachedLimit && options.maxTokens && options.maxTokens > cachedLimit) {
      console.log(`[LLMProviderService] Using cached limit for ${options.model}: ${cachedLimit}`);
      options = { ...options, maxTokens: cachedLimit };
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.createCompletion(options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Handle temperature unsupported errors - learn and retry without temperature
        if (isTemperatureUnsupportedError(error) && !temperatureRetried) {
          temperatureCache.markAsNoTemperatureSupport(options.model);
          console.log(`[LLMProviderService] Model ${options.model} doesn't support temperature, retrying without it`);
          // Remove temperature from options - the provider methods will check modelSupportsTemperature()
          // which now consults the cache, so the retry will work without temperature
          options = { ...options, temperature: undefined };
          temperatureRetried = true;
          continue;
        }

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
}
