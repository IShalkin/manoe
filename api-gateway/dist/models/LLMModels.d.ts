/**
 * LLM Provider Models and Types
 * Defines types for multi-provider LLM support (BYOK - Bring Your Own Key)
 */
/**
 * Supported LLM providers
 */
export declare enum LLMProvider {
    OPENAI = "openai",
    ANTHROPIC = "anthropic",
    GEMINI = "gemini",
    OPENROUTER = "openrouter",
    DEEPSEEK = "deepseek",
    VENICE = "venice"
}
/**
 * Chat message role
 */
export declare enum MessageRole {
    SYSTEM = "system",
    USER = "user",
    ASSISTANT = "assistant"
}
/**
 * Chat message structure
 */
export declare class ChatMessage {
    role: MessageRole;
    content: string;
}
/**
 * Token usage statistics
 */
export declare class TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
/**
 * Unified response from any LLM provider
 */
export declare class LLMResponse {
    content: string;
    model: string;
    provider: LLMProvider;
    usage: TokenUsage;
    finishReason: string;
    latencyMs?: number;
}
/**
 * LLM completion request options
 */
export declare class CompletionOptions {
    messages: ChatMessage[];
    model: string;
    provider: LLMProvider;
    apiKey: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: {
        type: "json_object" | "text";
    };
}
/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
    apiKey: string;
    baseUrl?: string;
    organizationId?: string;
}
/**
 * Generation phase enum matching Python orchestrator
 */
export declare enum GenerationPhase {
    GENESIS = "genesis",
    CHARACTERS = "characters",
    NARRATOR_DESIGN = "narrator_design",
    WORLDBUILDING = "worldbuilding",
    OUTLINING = "outlining",
    ADVANCED_PLANNING = "advanced_planning",
    DRAFTING = "drafting",
    CRITIQUE = "critique",
    REVISION = "revision",
    ORIGINALITY_CHECK = "originality_check",
    IMPACT_ASSESSMENT = "impact_assessment",
    POLISH = "polish"
}
/**
 * Dynamic max_tokens limits based on phase/task type
 * These are tuned for the expected output size of each phase
 */
export declare const PHASE_MAX_TOKENS: Record<GenerationPhase, number>;
export declare const DEFAULT_MAX_TOKENS = 8192;
/**
 * Get appropriate max_tokens limit based on current phase
 */
export declare function getMaxTokensForPhase(phase?: GenerationPhase): number;
/**
 * Default models for each provider (December 2025)
 * Based on README.md Model Tiers
 */
export declare const DEFAULT_MODELS: Record<LLMProvider, string>;
/**
 * Get default model for a provider
 */
export declare function getDefaultModel(provider: LLMProvider): string;
//# sourceMappingURL=LLMModels.d.ts.map