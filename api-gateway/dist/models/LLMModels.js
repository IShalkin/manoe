"use strict";
/**
 * LLM Provider Models and Types
 * Defines types for multi-provider LLM support (BYOK - Bring Your Own Key)
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODELS = exports.DEFAULT_MAX_TOKENS = exports.PHASE_MAX_TOKENS = exports.GenerationPhase = exports.CompletionOptions = exports.LLMResponse = exports.TokenUsage = exports.ChatMessage = exports.MessageRole = exports.LLMProvider = void 0;
exports.getMaxTokensForPhase = getMaxTokensForPhase;
exports.getDefaultModel = getDefaultModel;
const schema_1 = require("@tsed/schema");
/**
 * Supported LLM providers
 */
var LLMProvider;
(function (LLMProvider) {
    LLMProvider["OPENAI"] = "openai";
    LLMProvider["ANTHROPIC"] = "anthropic";
    LLMProvider["GEMINI"] = "gemini";
    LLMProvider["OPENROUTER"] = "openrouter";
    LLMProvider["DEEPSEEK"] = "deepseek";
    LLMProvider["VENICE"] = "venice";
})(LLMProvider || (exports.LLMProvider = LLMProvider = {}));
/**
 * Chat message role
 */
var MessageRole;
(function (MessageRole) {
    MessageRole["SYSTEM"] = "system";
    MessageRole["USER"] = "user";
    MessageRole["ASSISTANT"] = "assistant";
})(MessageRole || (exports.MessageRole = MessageRole = {}));
/**
 * Chat message structure
 */
class ChatMessage {
    role;
    content;
}
exports.ChatMessage = ChatMessage;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(MessageRole),
    __metadata("design:type", String)
], ChatMessage.prototype, "role", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], ChatMessage.prototype, "content", void 0);
/**
 * Token usage statistics
 */
class TokenUsage {
    promptTokens = 0;
    completionTokens = 0;
    totalTokens = 0;
}
exports.TokenUsage = TokenUsage;
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], TokenUsage.prototype, "promptTokens", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], TokenUsage.prototype, "completionTokens", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], TokenUsage.prototype, "totalTokens", void 0);
/**
 * Unified response from any LLM provider
 */
class LLMResponse {
    content;
    model;
    provider;
    usage;
    finishReason = "stop";
    latencyMs;
}
exports.LLMResponse = LLMResponse;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], LLMResponse.prototype, "content", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], LLMResponse.prototype, "model", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(LLMProvider),
    __metadata("design:type", String)
], LLMResponse.prototype, "provider", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", TokenUsage)
], LLMResponse.prototype, "usage", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], LLMResponse.prototype, "finishReason", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], LLMResponse.prototype, "latencyMs", void 0);
/**
 * LLM completion request options
 */
class CompletionOptions {
    messages;
    model;
    provider;
    apiKey;
    temperature = 0.7;
    maxTokens;
    responseFormat;
    runId;
    agentName;
}
exports.CompletionOptions = CompletionOptions;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Array)
], CompletionOptions.prototype, "messages", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], CompletionOptions.prototype, "model", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(LLMProvider),
    __metadata("design:type", String)
], CompletionOptions.prototype, "provider", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], CompletionOptions.prototype, "apiKey", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], CompletionOptions.prototype, "temperature", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], CompletionOptions.prototype, "maxTokens", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Object)
], CompletionOptions.prototype, "responseFormat", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], CompletionOptions.prototype, "runId", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], CompletionOptions.prototype, "agentName", void 0);
/**
 * Generation phase enum matching Python orchestrator
 */
var GenerationPhase;
(function (GenerationPhase) {
    GenerationPhase["GENESIS"] = "genesis";
    GenerationPhase["CHARACTERS"] = "characters";
    GenerationPhase["NARRATOR_DESIGN"] = "narrator_design";
    GenerationPhase["WORLDBUILDING"] = "worldbuilding";
    GenerationPhase["OUTLINING"] = "outlining";
    GenerationPhase["ADVANCED_PLANNING"] = "advanced_planning";
    GenerationPhase["DRAFTING"] = "drafting";
    GenerationPhase["CRITIQUE"] = "critique";
    GenerationPhase["REVISION"] = "revision";
    GenerationPhase["ORIGINALITY_CHECK"] = "originality_check";
    GenerationPhase["IMPACT_ASSESSMENT"] = "impact_assessment";
    GenerationPhase["POLISH"] = "polish";
})(GenerationPhase || (exports.GenerationPhase = GenerationPhase = {}));
/**
 * Dynamic max_tokens limits based on phase/task type
 * These are tuned for the expected output size of each phase
 */
exports.PHASE_MAX_TOKENS = {
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
exports.DEFAULT_MAX_TOKENS = 8192;
/**
 * Get appropriate max_tokens limit based on current phase
 */
function getMaxTokensForPhase(phase) {
    if (!phase)
        return exports.DEFAULT_MAX_TOKENS;
    return exports.PHASE_MAX_TOKENS[phase] ?? exports.DEFAULT_MAX_TOKENS;
}
/**
 * Default models for each provider (December 2025)
 * Based on README.md Model Tiers
 */
exports.DEFAULT_MODELS = {
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
function getDefaultModel(provider) {
    return exports.DEFAULT_MODELS[provider] ?? exports.DEFAULT_MODELS[LLMProvider.OPENAI];
}
//# sourceMappingURL=LLMModels.js.map