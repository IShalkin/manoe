declare const OPENAI_MODELS: {
    "gpt-4o": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "gpt-4o-mini": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "gpt-4-turbo": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "gpt-3.5-turbo": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "o1-preview": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "o1-mini": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
};
declare const OPENROUTER_MODELS: {
    "openai/gpt-4o": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "anthropic/claude-3.5-sonnet": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "anthropic/claude-3-opus": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "google/gemini-pro-1.5": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "meta-llama/llama-3.1-405b-instruct": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "meta-llama/llama-3.1-70b-instruct": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "mistralai/mistral-large": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "qwen/qwen-2.5-72b-instruct": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
};
declare const GEMINI_MODELS: {
    "gemini-2.0-flash-exp": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "gemini-1.5-pro": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "gemini-1.5-flash": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "gemini-1.5-flash-8b": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
};
declare const CLAUDE_MODELS: {
    "claude-3-5-sonnet-20241022": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "claude-3-5-haiku-20241022": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "claude-3-opus-20240229": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "claude-3-sonnet-20240229": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
    "claude-3-haiku-20240307": {
        name: string;
        description: string;
        contextWindow: number;
        maxOutput: number;
        recommendedFor: string[];
    };
};
export declare class ModelsController {
    getAllModels(): Promise<{
        openai: typeof OPENAI_MODELS;
        openrouter: typeof OPENROUTER_MODELS;
        gemini: typeof GEMINI_MODELS;
        claude: typeof CLAUDE_MODELS;
    }>;
    getProviders(): Promise<{
        providers: Array<{
            id: string;
            name: string;
            description: string;
            baseUrl: string;
        }>;
    }>;
    getProviderModels(providerId: string): Promise<{
        models: Record<string, unknown>;
    }>;
    getRecommendedModels(agentName: string): Promise<{
        agent: string;
        recommendations: Record<string, string[]>;
    }>;
    getAgentRoles(): Promise<{
        agents: Array<{
            name: string;
            phase: string;
            description: string;
            defaultProvider: string;
            defaultModel: string;
        }>;
    }>;
}
export {};
//# sourceMappingURL=ModelsController.d.ts.map