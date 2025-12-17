/**
 * LLM Provider Models and Types
 * Defines types for multi-provider LLM support (BYOK - Bring Your Own Key)
 */

import { Property, Required, Enum, Optional } from "@tsed/schema";

/**
 * Supported LLM providers
 */
export enum LLMProvider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GEMINI = "gemini",
  OPENROUTER = "openrouter",
  DEEPSEEK = "deepseek",
  VENICE = "venice",
}

/**
 * Chat message role
 */
export enum MessageRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
}

/**
 * Chat message structure
 */
export class ChatMessage {
  @Required()
  @Enum(MessageRole)
  role: MessageRole;

  @Required()
  @Property()
  content: string;
}

/**
 * Token usage statistics
 */
export class TokenUsage {
  @Property()
  promptTokens: number = 0;

  @Property()
  completionTokens: number = 0;

  @Property()
  totalTokens: number = 0;
}

/**
 * Unified response from any LLM provider
 */
export class LLMResponse {
  @Required()
  @Property()
  content: string;

  @Required()
  @Property()
  model: string;

  @Required()
  @Enum(LLMProvider)
  provider: LLMProvider;

  @Required()
  @Property()
  usage: TokenUsage;

  @Property()
  finishReason: string = "stop";

  @Optional()
  @Property()
  latencyMs?: number;
}

/**
 * LLM completion request options
 */
export class CompletionOptions {
  @Required()
  @Property()
  messages: ChatMessage[];

  @Required()
  @Property()
  model: string;

  @Required()
  @Enum(LLMProvider)
  provider: LLMProvider;

  @Required()
  @Property()
  apiKey: string;

  @Optional()
  @Property()
  temperature?: number = 0.7;

  @Optional()
  @Property()
  maxTokens?: number;

  @Optional()
  @Property()
  responseFormat?: { type: "json_object" | "text" };
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
export enum GenerationPhase {
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
  POLISH = "polish",
}

/**
 * Dynamic max_tokens limits based on phase/task type
 * These are tuned for the expected output size of each phase
 */
export const PHASE_MAX_TOKENS: Record<GenerationPhase, number> = {
  [GenerationPhase.OUTLINING]: 16384,
  [GenerationPhase.DRAFTING]: 16384,
  [GenerationPhase.REVISION]: 16384,
  [GenerationPhase.POLISH]: 12288,
  [GenerationPhase.WORLDBUILDING]: 12288,
  [GenerationPhase.CHARACTERS]: 10240,
  [GenerationPhase.GENESIS]: 8192,
  [GenerationPhase.IMPACT_ASSESSMENT]: 8192,
  [GenerationPhase.NARRATOR_DESIGN]: 6144,
  [GenerationPhase.ADVANCED_PLANNING]: 8192,
  [GenerationPhase.CRITIQUE]: 6144,
  [GenerationPhase.ORIGINALITY_CHECK]: 4096,
};

export const DEFAULT_MAX_TOKENS = 8192;

/**
 * Get appropriate max_tokens limit based on current phase
 */
export function getMaxTokensForPhase(phase?: GenerationPhase): number {
  if (!phase) return DEFAULT_MAX_TOKENS;
  return PHASE_MAX_TOKENS[phase] ?? DEFAULT_MAX_TOKENS;
}

/**
 * Default models for each provider (December 2025)
 * Based on README.md Model Tiers
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: "gpt-5.2",
  [LLMProvider.ANTHROPIC]: "claude-opus-4.5",
  [LLMProvider.GEMINI]: "gemini-3-pro",
  [LLMProvider.OPENROUTER]: "google/gemini-3-pro",
  [LLMProvider.DEEPSEEK]: "deepseek-v3",
  [LLMProvider.VENICE]: "dolphin-mistral-24b",
};

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: LLMProvider): string {
  return DEFAULT_MODELS[provider] ?? DEFAULT_MODELS[LLMProvider.OPENAI];
}
