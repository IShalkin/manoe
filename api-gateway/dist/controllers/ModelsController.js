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
exports.ModelsController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
// Model definitions matching the Python orchestrator
const OPENAI_MODELS = {
    "gpt-4o": {
        name: "GPT-4o",
        description: "Most capable GPT-4 model, multimodal",
        contextWindow: 128000,
        maxOutput: 16384,
        recommendedFor: ["architect", "profiler", "strategist", "critic"],
    },
    "gpt-4o-mini": {
        name: "GPT-4o Mini",
        description: "Smaller, faster, cheaper GPT-4o variant",
        contextWindow: 128000,
        maxOutput: 16384,
        recommendedFor: ["writer"],
    },
    "gpt-4-turbo": {
        name: "GPT-4 Turbo",
        description: "GPT-4 Turbo with vision capabilities",
        contextWindow: 128000,
        maxOutput: 4096,
        recommendedFor: ["architect", "critic"],
    },
    "gpt-3.5-turbo": {
        name: "GPT-3.5 Turbo",
        description: "Fast and cost-effective",
        contextWindow: 16385,
        maxOutput: 4096,
        recommendedFor: ["writer"],
    },
    "o1-preview": {
        name: "O1 Preview",
        description: "Advanced reasoning model",
        contextWindow: 128000,
        maxOutput: 32768,
        recommendedFor: ["architect", "strategist"],
    },
    "o1-mini": {
        name: "O1 Mini",
        description: "Smaller reasoning model",
        contextWindow: 128000,
        maxOutput: 65536,
        recommendedFor: ["strategist"],
    },
};
const OPENROUTER_MODELS = {
    "openai/gpt-4o": {
        name: "GPT-4o (via OpenRouter)",
        description: "OpenAI GPT-4o through OpenRouter",
        contextWindow: 128000,
        maxOutput: 16384,
        recommendedFor: ["architect", "profiler", "strategist", "critic"],
    },
    "anthropic/claude-3.5-sonnet": {
        name: "Claude 3.5 Sonnet (via OpenRouter)",
        description: "Anthropic Claude 3.5 Sonnet through OpenRouter",
        contextWindow: 200000,
        maxOutput: 8192,
        recommendedFor: ["architect", "profiler", "critic", "writer"],
    },
    "anthropic/claude-3-opus": {
        name: "Claude 3 Opus (via OpenRouter)",
        description: "Anthropic Claude 3 Opus through OpenRouter",
        contextWindow: 200000,
        maxOutput: 4096,
        recommendedFor: ["architect", "critic"],
    },
    "google/gemini-pro-1.5": {
        name: "Gemini Pro 1.5 (via OpenRouter)",
        description: "Google Gemini Pro 1.5 through OpenRouter",
        contextWindow: 1000000,
        maxOutput: 8192,
        recommendedFor: ["strategist", "writer"],
    },
    "meta-llama/llama-3.1-405b-instruct": {
        name: "Llama 3.1 405B (via OpenRouter)",
        description: "Meta Llama 3.1 405B Instruct",
        contextWindow: 131072,
        maxOutput: 4096,
        recommendedFor: ["writer"],
    },
    "meta-llama/llama-3.1-70b-instruct": {
        name: "Llama 3.1 70B (via OpenRouter)",
        description: "Meta Llama 3.1 70B Instruct",
        contextWindow: 131072,
        maxOutput: 4096,
        recommendedFor: ["writer"],
    },
    "mistralai/mistral-large": {
        name: "Mistral Large (via OpenRouter)",
        description: "Mistral AI Large model",
        contextWindow: 128000,
        maxOutput: 4096,
        recommendedFor: ["writer", "profiler"],
    },
    "qwen/qwen-2.5-72b-instruct": {
        name: "Qwen 2.5 72B (via OpenRouter)",
        description: "Alibaba Qwen 2.5 72B Instruct",
        contextWindow: 131072,
        maxOutput: 8192,
        recommendedFor: ["writer", "profiler"],
    },
};
const GEMINI_MODELS = {
    "gemini-2.0-flash-exp": {
        name: "Gemini 2.0 Flash (Experimental)",
        description: "Latest Gemini 2.0 Flash experimental model",
        contextWindow: 1000000,
        maxOutput: 8192,
        recommendedFor: ["architect", "strategist", "writer"],
    },
    "gemini-1.5-pro": {
        name: "Gemini 1.5 Pro",
        description: "Most capable Gemini model with 1M context",
        contextWindow: 1000000,
        maxOutput: 8192,
        recommendedFor: ["architect", "profiler", "strategist", "critic"],
    },
    "gemini-1.5-flash": {
        name: "Gemini 1.5 Flash",
        description: "Fast and efficient Gemini model",
        contextWindow: 1000000,
        maxOutput: 8192,
        recommendedFor: ["writer"],
    },
    "gemini-1.5-flash-8b": {
        name: "Gemini 1.5 Flash 8B",
        description: "Smallest and fastest Gemini model",
        contextWindow: 1000000,
        maxOutput: 8192,
        recommendedFor: ["writer"],
    },
};
const CLAUDE_MODELS = {
    "claude-3-5-sonnet-20241022": {
        name: "Claude 3.5 Sonnet (Latest)",
        description: "Most intelligent Claude model, best for complex tasks",
        contextWindow: 200000,
        maxOutput: 8192,
        recommendedFor: ["architect", "profiler", "strategist", "critic", "writer"],
    },
    "claude-3-5-haiku-20241022": {
        name: "Claude 3.5 Haiku",
        description: "Fast and cost-effective Claude model",
        contextWindow: 200000,
        maxOutput: 8192,
        recommendedFor: ["writer"],
    },
    "claude-3-opus-20240229": {
        name: "Claude 3 Opus",
        description: "Most powerful Claude 3 model for complex reasoning",
        contextWindow: 200000,
        maxOutput: 4096,
        recommendedFor: ["architect", "critic"],
    },
    "claude-3-sonnet-20240229": {
        name: "Claude 3 Sonnet",
        description: "Balanced Claude 3 model",
        contextWindow: 200000,
        maxOutput: 4096,
        recommendedFor: ["profiler", "strategist"],
    },
    "claude-3-haiku-20240307": {
        name: "Claude 3 Haiku",
        description: "Fastest Claude 3 model",
        contextWindow: 200000,
        maxOutput: 4096,
        recommendedFor: ["writer"],
    },
};
let ModelsController = class ModelsController {
    async getAllModels() {
        return {
            openai: OPENAI_MODELS,
            openrouter: OPENROUTER_MODELS,
            gemini: GEMINI_MODELS,
            claude: CLAUDE_MODELS,
        };
    }
    async getProviders() {
        return {
            providers: [
                {
                    id: "openai",
                    name: "OpenAI",
                    description: "OpenAI GPT models including GPT-4o and O1",
                    baseUrl: "https://api.openai.com/v1",
                },
                {
                    id: "openrouter",
                    name: "OpenRouter",
                    description: "Access multiple providers through one API",
                    baseUrl: "https://openrouter.ai/api/v1",
                },
                {
                    id: "gemini",
                    name: "Google Gemini",
                    description: "Google's Gemini models with 1M context",
                    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
                },
                {
                    id: "claude",
                    name: "Anthropic Claude",
                    description: "Anthropic's Claude models",
                    baseUrl: "https://api.anthropic.com/v1",
                },
            ],
        };
    }
    async getProviderModels(providerId) {
        const providerModels = {
            openai: OPENAI_MODELS,
            openrouter: OPENROUTER_MODELS,
            gemini: GEMINI_MODELS,
            claude: CLAUDE_MODELS,
        };
        const models = providerModels[providerId];
        if (!models) {
            throw new Error(`Unknown provider: ${providerId}`);
        }
        return { models };
    }
    async getRecommendedModels(agentName) {
        const allModels = {
            openai: OPENAI_MODELS,
            openrouter: OPENROUTER_MODELS,
            gemini: GEMINI_MODELS,
            claude: CLAUDE_MODELS,
        };
        const recommendations = {};
        for (const [provider, models] of Object.entries(allModels)) {
            const recommended = [];
            for (const [modelId, modelInfo] of Object.entries(models)) {
                if (modelInfo.recommendedFor.includes(agentName.toLowerCase())) {
                    recommended.push(modelId);
                }
            }
            if (recommended.length > 0) {
                recommendations[provider] = recommended;
            }
        }
        return {
            agent: agentName,
            recommendations,
        };
    }
    async getAgentRoles() {
        return {
            agents: [
                {
                    name: "architect",
                    phase: "Genesis",
                    description: "Transforms seed ideas into structured narrative possibilities",
                    defaultProvider: "openai",
                    defaultModel: "gpt-4o",
                },
                {
                    name: "profiler",
                    phase: "Characters",
                    description: "Creates psychologically deep character profiles",
                    defaultProvider: "openai",
                    defaultModel: "gpt-4o",
                },
                {
                    name: "strategist",
                    phase: "Outlining",
                    description: "Creates detailed scene-by-scene plot outlines",
                    defaultProvider: "openai",
                    defaultModel: "gpt-4o",
                },
                {
                    name: "writer",
                    phase: "Drafting",
                    description: "Transforms scene outlines into vivid prose",
                    defaultProvider: "openai",
                    defaultModel: "gpt-4o-mini",
                },
                {
                    name: "critic",
                    phase: "Critique",
                    description: "Provides artistic critique of scene drafts",
                    defaultProvider: "openai",
                    defaultModel: "gpt-4o",
                },
            ],
        };
    }
};
exports.ModelsController = ModelsController;
__decorate([
    (0, common_1.Get)("/"),
    (0, schema_1.Summary)("Get all available models"),
    (0, schema_1.Description)("List all available models grouped by provider"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ModelsController.prototype, "getAllModels", null);
__decorate([
    (0, common_1.Get)("/providers"),
    (0, schema_1.Summary)("Get available providers"),
    (0, schema_1.Description)("List all supported LLM providers"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ModelsController.prototype, "getProviders", null);
__decorate([
    (0, common_1.Get)("/provider/:providerId"),
    (0, schema_1.Summary)("Get models for a provider"),
    (0, schema_1.Description)("List all models available for a specific provider"),
    __param(0, (0, common_1.QueryParams)("providerId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ModelsController.prototype, "getProviderModels", null);
__decorate([
    (0, common_1.Get)("/recommended/:agentName"),
    (0, schema_1.Summary)("Get recommended models for an agent"),
    (0, schema_1.Description)("List models recommended for a specific agent role"),
    __param(0, (0, common_1.QueryParams)("agentName")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ModelsController.prototype, "getRecommendedModels", null);
__decorate([
    (0, common_1.Get)("/agents"),
    (0, schema_1.Summary)("Get agent roles"),
    (0, schema_1.Description)("List all agent roles and their purposes"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ModelsController.prototype, "getAgentRoles", null);
exports.ModelsController = ModelsController = __decorate([
    (0, common_1.Controller)("/models"),
    (0, schema_1.Tags)("Models"),
    (0, schema_1.Description)("LLM model information and configuration")
], ModelsController);
//# sourceMappingURL=ModelsController.js.map