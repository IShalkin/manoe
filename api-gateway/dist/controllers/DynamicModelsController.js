"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicModelsController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
let DynamicModelsController = class DynamicModelsController {
    async fetchModels(body) {
        const { provider, api_key } = body;
        if (!provider || !api_key) {
            return {
                success: false,
                error: "Provider and API key are required",
            };
        }
        try {
            const models = await this.fetchModelsFromProvider(provider, api_key);
            return {
                success: true,
                models,
            };
        }
        catch (error) {
            common_1.$log.error(`[DynamicModelsController] Error fetching models for ${provider}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to fetch models",
            };
        }
    }
    async fetchModelsFromProvider(provider, apiKey) {
        switch (provider.toLowerCase()) {
            case "openai":
                return this.fetchOpenAIModels(apiKey);
            case "openrouter":
                return this.fetchOpenRouterModels(apiKey);
            case "anthropic":
                return this.fetchAnthropicModels(apiKey);
            case "gemini":
                return this.fetchGeminiModels(apiKey);
            case "deepseek":
                return this.fetchDeepSeekModels(apiKey);
            case "venice":
                return this.fetchVeniceModels(apiKey);
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }
    async fetchOpenAIModels(apiKey) {
        const response = await fetch("https://api.openai.com/v1/models", {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        // Filter to only include chat models (gpt-*, o1-*, chatgpt-*)
        const chatModels = data.data.filter((model) => model.id.startsWith("gpt-") ||
            model.id.startsWith("o1-") ||
            model.id.startsWith("o3-") ||
            model.id.startsWith("chatgpt-"));
        return chatModels.map((model) => ({
            id: model.id,
            name: this.formatModelName(model.id),
            context_length: this.getOpenAIContextLength(model.id),
        }));
    }
    async fetchOpenRouterModels(apiKey) {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        return data.data.map((model) => ({
            id: model.id,
            name: model.name || model.id,
            context_length: model.context_length,
            description: model.description,
        }));
    }
    async fetchAnthropicModels(apiKey) {
        // Anthropic doesn't have a public models list API, so we return known models
        // We validate the API key by making a minimal request
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 1,
                messages: [{ role: "user", content: "hi" }],
            }),
        });
        // If we get 401, the key is invalid
        if (response.status === 401) {
            throw new Error("Invalid Anthropic API key");
        }
        // Return known Claude models
        return [
            { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (Latest)", context_length: 200000 },
            { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", context_length: 200000 },
            { id: "claude-3-opus-20240229", name: "Claude 3 Opus", context_length: 200000 },
            { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", context_length: 200000 },
            { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", context_length: 200000 },
        ];
    }
    async fetchGeminiModels(apiKey) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        // Filter to only include generative models
        const generativeModels = data.models.filter((model) => model.supportedGenerationMethods?.includes("generateContent"));
        return generativeModels.map((model) => ({
            id: model.name.replace("models/", ""),
            name: model.displayName || model.name,
            context_length: model.inputTokenLimit,
            description: model.description,
        }));
    }
    async fetchDeepSeekModels(apiKey) {
        const response = await fetch("https://api.deepseek.com/models", {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        return data.data.map((model) => ({
            id: model.id,
            name: this.formatModelName(model.id),
            context_length: 64000, // DeepSeek default
        }));
    }
    async fetchVeniceModels(apiKey) {
        const response = await fetch("https://api.venice.ai/api/v1/models", {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Venice API error: ${response.status} - ${error}`);
        }
        const data = await response.json();
        return data.data.map((model) => ({
            id: model.id,
            name: model.name || model.id,
            context_length: model.context_length,
        }));
    }
    formatModelName(modelId) {
        return modelId
            .split("-")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }
    getOpenAIContextLength(modelId) {
        const contextLengths = {
            "gpt-4o": 128000,
            "gpt-4o-mini": 128000,
            "gpt-4-turbo": 128000,
            "gpt-4": 8192,
            "gpt-3.5-turbo": 16385,
            "o1-preview": 128000,
            "o1-mini": 128000,
            "o3-mini": 200000,
        };
        // Check for exact match first
        if (contextLengths[modelId]) {
            return contextLengths[modelId];
        }
        // Check for prefix match
        for (const [prefix, length] of Object.entries(contextLengths)) {
            if (modelId.startsWith(prefix)) {
                return length;
            }
        }
        return 128000; // Default for newer models
    }
};
exports.DynamicModelsController = DynamicModelsController;
__decorate([
    (0, common_1.Post)("/"),
    (0, schema_1.Summary)("Fetch models from provider API"),
    (0, schema_1.Description)("Fetches available models from a provider using the provided API key"),
    (0, schema_1.Returns)(200),
    __param(0, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DynamicModelsController.prototype, "fetchModels", null);
exports.DynamicModelsController = DynamicModelsController = __decorate([
    (0, common_1.Controller)("/models"),
    (0, schema_1.Tags)("Dynamic Models"),
    (0, schema_1.Description)("Dynamic model fetching from provider APIs")
], DynamicModelsController);
//# sourceMappingURL=DynamicModelsController.js.map