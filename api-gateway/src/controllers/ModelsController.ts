import { Controller, Get, QueryParams } from "@tsed/common";
import { Description, Summary, Tags } from "@tsed/schema";

// Current-generation model catalog (June 2026).
// Flagship defaults live in LLMModels.ts DEFAULT_MODELS; this catalog is the
// frontend-facing menu of selectable models per provider.
const OPENAI_MODELS = {
  "gpt-5.5": {
    name: "GPT-5.5",
    description: "Flagship OpenAI model for coding and professional work",
    contextWindow: 1000000,
    maxOutput: 128000,
    recommendedFor: ["architect", "profiler", "strategist", "critic"],
  },
  "gpt-5.4": {
    name: "GPT-5.4",
    description: "Previous flagship; strong reasoning and general purpose",
    contextWindow: 400000,
    maxOutput: 128000,
    recommendedFor: ["architect", "strategist", "critic"],
  },
  "gpt-5.4-mini": {
    name: "GPT-5.4 Mini",
    description: "Strong, fast, cost-effective mini model",
    contextWindow: 400000,
    maxOutput: 128000,
    recommendedFor: ["writer"],
  },
  "gpt-5.4-nano": {
    name: "GPT-5.4 Nano",
    description: "Smallest, lowest-latency and cheapest GPT-5.4 variant",
    contextWindow: 400000,
    maxOutput: 128000,
    recommendedFor: ["writer"],
  },
};

const OPENROUTER_MODELS = {
  "openai/gpt-5.5": {
    name: "GPT-5.5 (via OpenRouter)",
    description: "OpenAI GPT-5.5 through OpenRouter",
    contextWindow: 1000000,
    maxOutput: 128000,
    recommendedFor: ["architect", "profiler", "strategist", "critic"],
  },
  "anthropic/claude-opus-4.8": {
    name: "Claude Opus 4.8 (via OpenRouter)",
    description: "Anthropic Claude Opus 4.8 through OpenRouter",
    contextWindow: 1000000,
    maxOutput: 128000,
    recommendedFor: ["architect", "profiler", "critic", "writer"],
  },
  "google/gemini-3.1-pro-preview": {
    name: "Gemini 3.1 Pro (via OpenRouter)",
    description: "Google Gemini 3.1 Pro through OpenRouter",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["architect", "strategist", "writer"],
  },
  "deepseek/deepseek-v3.2": {
    name: "DeepSeek V3.2 (via OpenRouter)",
    description: "DeepSeek V3.2 through OpenRouter",
    contextWindow: 128000,
    maxOutput: 8192,
    recommendedFor: ["writer", "profiler"],
  },
};

const GEMINI_MODELS = {
  "gemini-3.1-pro-preview": {
    name: "Gemini 3.1 Pro",
    description: "Most capable Gemini model for complex reasoning",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["architect", "profiler", "strategist", "critic"],
  },
  "gemini-3.5-flash": {
    name: "Gemini 3.5 Flash",
    description: "Frontier-class performance for agentic and coding tasks",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["architect", "strategist", "writer"],
  },
  "gemini-3.1-flash-lite": {
    name: "Gemini 3.1 Flash-Lite",
    description: "Fastest, most budget-friendly Gemini model",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["writer"],
  },
};

const CLAUDE_MODELS = {
  "claude-opus-4-8": {
    name: "Claude Opus 4.8",
    description: "Most capable Claude model for complex reasoning and prose",
    contextWindow: 1000000,
    maxOutput: 128000,
    recommendedFor: ["architect", "profiler", "strategist", "critic", "writer"],
  },
  "claude-sonnet-4-7": {
    name: "Claude Sonnet 4.7",
    description: "Best combination of speed and intelligence",
    contextWindow: 1000000,
    maxOutput: 64000,
    recommendedFor: ["profiler", "strategist", "writer"],
  },
  "claude-haiku-4-5": {
    name: "Claude Haiku 4.5",
    description: "Fastest Claude model with near-frontier intelligence",
    contextWindow: 200000,
    maxOutput: 64000,
    recommendedFor: ["writer"],
  },
};

@Controller("/models")
@Tags("Models")
@Description("LLM model information and configuration")
export class ModelsController {
  @Get("/")
  @Summary("Get all available models")
  @Description("List all available models grouped by provider")
  async getAllModels(): Promise<{
    openai: typeof OPENAI_MODELS;
    openrouter: typeof OPENROUTER_MODELS;
    gemini: typeof GEMINI_MODELS;
    claude: typeof CLAUDE_MODELS;
  }> {
    return {
      openai: OPENAI_MODELS,
      openrouter: OPENROUTER_MODELS,
      gemini: GEMINI_MODELS,
      claude: CLAUDE_MODELS,
    };
  }

  @Get("/providers")
  @Summary("Get available providers")
  @Description("List all supported LLM providers")
  async getProviders(): Promise<{
    providers: Array<{
      id: string;
      name: string;
      description: string;
      baseUrl: string;
    }>;
  }> {
    return {
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          description: "OpenAI GPT models including GPT-5.5 and GPT-5.4 mini/nano variants",
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

  @Get("/provider/:providerId")
  @Summary("Get models for a provider")
  @Description("List all models available for a specific provider")
  async getProviderModels(
    @QueryParams("providerId") providerId: string
  ): Promise<{ models: Record<string, unknown> }> {
    const providerModels: Record<string, Record<string, unknown>> = {
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

  @Get("/recommended/:agentName")
  @Summary("Get recommended models for an agent")
  @Description("List models recommended for a specific agent role")
  async getRecommendedModels(
    @QueryParams("agentName") agentName: string
  ): Promise<{
    agent: string;
    recommendations: Record<string, string[]>;
  }> {
    const allModels = {
      openai: OPENAI_MODELS,
      openrouter: OPENROUTER_MODELS,
      gemini: GEMINI_MODELS,
      claude: CLAUDE_MODELS,
    };

    const recommendations: Record<string, string[]> = {};

    for (const [provider, models] of Object.entries(allModels)) {
      const recommended: string[] = [];
      for (const [modelId, modelInfo] of Object.entries(models)) {
        if ((modelInfo as { recommendedFor: string[] }).recommendedFor.includes(agentName.toLowerCase())) {
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

  @Get("/agents")
  @Summary("Get agent roles")
  @Description("List all agent roles and their purposes")
  async getAgentRoles(): Promise<{
    agents: Array<{
      name: string;
      phase: string;
      description: string;
      defaultProvider: string;
      defaultModel: string;
    }>;
  }> {
    return {
      agents: [
        {
          name: "architect",
          phase: "Genesis",
          description: "Transforms seed ideas into structured narrative possibilities",
          defaultProvider: "openai",
          defaultModel: "gpt-5.5",
        },
        {
          name: "profiler",
          phase: "Characters",
          description: "Creates psychologically deep character profiles",
          defaultProvider: "openai",
          defaultModel: "gpt-5.5",
        },
        {
          name: "strategist",
          phase: "Outlining",
          description: "Creates detailed scene-by-scene plot outlines",
          defaultProvider: "openai",
          defaultModel: "gpt-5.5",
        },
        {
          name: "writer",
          phase: "Drafting",
          description: "Transforms scene outlines into vivid prose",
          defaultProvider: "openai",
          defaultModel: "gpt-5.4-mini",
        },
        {
          name: "critic",
          phase: "Critique",
          description: "Provides artistic critique of scene drafts",
          defaultProvider: "openai",
          defaultModel: "gpt-5.5",
        },
      ],
    };
  }
}
