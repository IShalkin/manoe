"""
LLM Provider Configuration - BYOK (Bring Your Own Key) Support
Supports OpenAI, OpenRouter, Google Gemini, and Anthropic Claude
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, SecretStr


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    OPENROUTER = "openrouter"
    GEMINI = "gemini"
    CLAUDE = "claude"
    DEEPSEEK = "deepseek"
    VENICE = "venice"


# ============================================================================
# Model Definitions by Provider
# ============================================================================

OPENAI_MODELS: Dict[str, Dict[str, Any]] = {
    # GPT-5 Family (December 2025)
    "gpt-5.2": {
        "name": "GPT-5.2",
        "description": "Latest GPT-5 with improved routing - decides when to think deep vs fast. Less moralistic than 5.0",
        "context_window": 256000,
        "max_output": 32768,
        "input_price_per_1k": 0.005,
        "output_price_per_1k": 0.02,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "strategist"]
    },
    "gpt-5": {
        "name": "GPT-5",
        "description": "GPT-5 base model with advanced reasoning",
        "context_window": 256000,
        "max_output": 32768,
        "input_price_per_1k": 0.004,
        "output_price_per_1k": 0.016,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "profiler", "strategist"]
    },
    # GPT-4 Family
    "gpt-4o": {
        "name": "GPT-4o",
        "description": "Most capable GPT-4 model, multimodal",
        "context_window": 128000,
        "max_output": 16384,
        "input_price_per_1k": 0.0025,
        "output_price_per_1k": 0.01,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["critic"]
    },
    "gpt-4o-mini": {
        "name": "GPT-4o Mini",
        "description": "Smaller, faster, cheaper GPT-4o variant",
        "context_window": 128000,
        "max_output": 16384,
        "input_price_per_1k": 0.00015,
        "output_price_per_1k": 0.0006,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
    # O-series Reasoning Models
    "o3": {
        "name": "O3",
        "description": "Advanced reasoning model with chain-of-thought",
        "context_window": 200000,
        "max_output": 65536,
        "input_price_per_1k": 0.01,
        "output_price_per_1k": 0.04,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["strategist"]
    },
    "o3-mini": {
        "name": "O3 Mini",
        "description": "Smaller O3 reasoning model",
        "context_window": 200000,
        "max_output": 65536,
        "input_price_per_1k": 0.0011,
        "output_price_per_1k": 0.0044,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["strategist"]
    },
    "o1": {
        "name": "O1",
        "description": "Original O-series reasoning model",
        "context_window": 200000,
        "max_output": 32768,
        "input_price_per_1k": 0.015,
        "output_price_per_1k": 0.06,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["architect", "strategist"]
    },
}

OPENROUTER_MODELS: Dict[str, Dict[str, Any]] = {
    # Top Tier - Claude Opus 4.5 (S+ Prose)
    "anthropic/claude-opus-4.5": {
        "name": "Claude Opus 4.5 (via OpenRouter)",
        "description": "Most human-like AI. Best for RP and literature. S+ Prose tier.",
        "context_window": 200000,
        "max_output": 16384,
        "recommended_for": ["architect", "writer", "critic"]
    },
    # Gemini 3 Pro (S+ Logic)
    "google/gemini-3-pro": {
        "name": "Gemini 3 Pro (via OpenRouter)",
        "description": "New king of AI. Deep Think integrated. Builds dynamic world model.",
        "context_window": 2000000,
        "max_output": 16384,
        "recommended_for": ["strategist"]
    },
    # Llama 4 Maverick (A+ Context - 256k)
    "meta-llama/llama-4-maverick": {
        "name": "Llama 4 Maverick (via OpenRouter)",
        "description": "256k context. 3x fewer refusals with Venice jailbreak.",
        "context_window": 256000,
        "max_output": 8192,
        "recommended_for": ["profiler", "strategist"]
    },
    # Qwen 3 (235B)
    "qwen/qwen-3-235b": {
        "name": "Qwen 3 235B (via OpenRouter)",
        "description": "Good for Eastern intrigue plots. Venice Medium/Large alternative.",
        "context_window": 131072,
        "max_output": 8192,
        "recommended_for": ["writer", "profiler"]
    },
    # OpenAI via OpenRouter
    "openai/gpt-5.2": {
        "name": "GPT-5.2 (via OpenRouter)",
        "description": "OpenAI GPT-5.2 with improved routing",
        "context_window": 256000,
        "max_output": 32768,
        "recommended_for": ["architect", "strategist"]
    },
    "openai/gpt-4o": {
        "name": "GPT-4o (via OpenRouter)",
        "description": "OpenAI GPT-4o through OpenRouter",
        "context_window": 128000,
        "max_output": 16384,
        "recommended_for": ["critic"]
    },
    # Anthropic via OpenRouter
    "anthropic/claude-3.5-sonnet": {
        "name": "Claude 3.5 Sonnet (via OpenRouter)",
        "description": "Anthropic Claude 3.5 Sonnet through OpenRouter",
        "context_window": 200000,
        "max_output": 8192,
        "recommended_for": ["profiler"]
    },
    # Google via OpenRouter
    "google/gemini-2.0-flash-exp": {
        "name": "Gemini 2.0 Flash (via OpenRouter)",
        "description": "Google Gemini 2.0 Flash with grounding",
        "context_window": 1000000,
        "max_output": 8192,
        "recommended_for": ["writer"]
    },
    # Meta Llama via OpenRouter
    "meta-llama/llama-3.3-70b-instruct": {
        "name": "Llama 3.3 70B (via OpenRouter)",
        "description": "Meta Llama 3.3 70B Instruct",
        "context_window": 131072,
        "max_output": 4096,
        "recommended_for": ["writer"]
    },
    # DeepSeek via OpenRouter
    "deepseek/deepseek-chat": {
        "name": "DeepSeek V3 (via OpenRouter)",
        "description": "DeepSeek V3 Chat model",
        "context_window": 64000,
        "max_output": 4096,
        "recommended_for": ["writer"]
    },
    # Qwen via OpenRouter
    "qwen/qwen-2.5-72b-instruct": {
        "name": "Qwen 2.5 72B (via OpenRouter)",
        "description": "Alibaba Qwen 2.5 72B Instruct",
        "context_window": 131072,
        "max_output": 8192,
        "recommended_for": ["writer", "profiler"]
    },
}

GEMINI_MODELS: Dict[str, Dict[str, Any]] = {
    # Gemini 3 Family (November 2025) - New King of AI
    "gemini-3-pro": {
        "name": "Gemini 3 Pro",
        "description": "New king of AI. Deep Think integrated into core. Builds dynamic world model of your plot. Solves tasks GPT-5 fails at.",
        "context_window": 2000000,
        "max_output": 16384,
        "input_price_per_1k": 0.0025,
        "output_price_per_1k": 0.01,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "strategist"]
    },
    "gemini-3-flash": {
        "name": "Gemini 3 Flash",
        "description": "Fast Gemini 3 variant for high-volume tasks",
        "context_window": 1000000,
        "max_output": 16384,
        "input_price_per_1k": 0.0005,
        "output_price_per_1k": 0.002,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
    # Gemini 2.0 Family
    "gemini-2.0-flash-exp": {
        "name": "Gemini 2.0 Flash (Experimental)",
        "description": "Gemini 2.0 Flash experimental model with grounding",
        "context_window": 1000000,
        "max_output": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
    "gemini-2.0-flash-thinking-exp": {
        "name": "Gemini 2.0 Flash Thinking",
        "description": "Gemini 2.0 with reasoning capabilities",
        "context_window": 1000000,
        "max_output": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["critic"]
    },
    # Gemini 1.5 Family
    "gemini-1.5-pro": {
        "name": "Gemini 1.5 Pro",
        "description": "Gemini 1.5 Pro with 2M context",
        "context_window": 2000000,
        "max_output": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["profiler"]
    },
    "gemini-1.5-flash": {
        "name": "Gemini 1.5 Flash",
        "description": "Fast and efficient Gemini model",
        "context_window": 1000000,
        "max_output": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
}

DEEPSEEK_MODELS: Dict[str, Dict[str, Any]] = {
    "deepseek-chat": {
        "name": "DeepSeek V3",
        "description": "DeepSeek's most capable chat model",
        "context_window": 64000,
        "max_output": 8192,
        "input_price_per_1k": 0.00014,
        "output_price_per_1k": 0.00028,
        "supports_vision": False,
        "supports_function_calling": True,
        "recommended_for": ["writer", "profiler"]
    },
    "deepseek-reasoner": {
        "name": "DeepSeek R1",
        "description": "DeepSeek reasoning model with chain-of-thought",
        "context_window": 64000,
        "max_output": 8192,
        "input_price_per_1k": 0.00055,
        "output_price_per_1k": 0.00219,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["architect", "strategist", "critic"]
    },
}

CLAUDE_MODELS: Dict[str, Dict[str, Any]] = {
    # Claude Opus 4.5 (November 2025) - S+ Prose, Most Human
    "claude-opus-4.5-20251201": {
        "name": "Claude Opus 4.5",
        "description": "Most human-like AI. Talented writer. Best for RP and literature. Many prefer it for style over technically stronger models.",
        "context_window": 200000,
        "max_output": 16384,
        "input_price_per_1k": 0.02,
        "output_price_per_1k": 0.1,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "writer", "critic"]
    },
    # Claude 4 Family
    "claude-sonnet-4-20250514": {
        "name": "Claude Sonnet 4",
        "description": "Claude 4 Sonnet with computer use capabilities",
        "context_window": 200000,
        "max_output": 8192,
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.015,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["profiler"]
    },
    "claude-opus-4-20250514": {
        "name": "Claude Opus 4",
        "description": "Claude 4 Opus for complex reasoning",
        "context_window": 200000,
        "max_output": 8192,
        "input_price_per_1k": 0.015,
        "output_price_per_1k": 0.075,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["strategist"]
    },
    # Claude 3.5 Family
    "claude-3-5-sonnet-20241022": {
        "name": "Claude 3.5 Sonnet",
        "description": "Claude 3.5 Sonnet with computer use",
        "context_window": 200000,
        "max_output": 8192,
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.015,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["profiler", "strategist"]
    },
    "claude-3-5-haiku-20241022": {
        "name": "Claude 3.5 Haiku",
        "description": "Fast and cost-effective Claude model",
        "context_window": 200000,
        "max_output": 8192,
        "input_price_per_1k": 0.0008,
        "output_price_per_1k": 0.004,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
}

VENICE_MODELS: Dict[str, Dict[str, Any]] = {
    # S+ Uncensored - Best for dialogues, roleplay, dark plots without censorship
    "dolphin-mistral-24b-venice": {
        "name": "Dolphin Mistral 24B Venice Edition",
        "description": "S+ Uncensored. Best uncensored model for creativity. No moralizing. Perfect for dark plots and political intrigue.",
        "context_window": 32000,
        "max_output": 8192,
        "input_price_per_1k": 0.0005,
        "output_price_per_1k": 0.0015,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["writer", "profiler"]
    },
    # Venice Large (Llama 4 Maverick with jailbreak)
    "llama-4-maverick-venice": {
        "name": "Llama 4 Maverick (Venice Large)",
        "description": "A+ Context. 256k context with Venice jailbreak. 3x fewer refusals. Technically smarter than Dolphin.",
        "context_window": 256000,
        "max_output": 8192,
        "input_price_per_1k": 0.0008,
        "output_price_per_1k": 0.0024,
        "supports_vision": False,
        "supports_function_calling": True,
        "recommended_for": ["architect", "strategist"]
    },
    # Qwen 3 (Venice Medium/Large alternative)
    "qwen-3-235b-venice": {
        "name": "Qwen 3 235B (Venice)",
        "description": "Good for Eastern intrigue plots. Venice Medium/Large alternative.",
        "context_window": 131072,
        "max_output": 8192,
        "input_price_per_1k": 0.0004,
        "output_price_per_1k": 0.0012,
        "supports_vision": False,
        "supports_function_calling": True,
        "recommended_for": ["writer", "profiler"]
    },
    # Other Venice models
    "llama-3.3-70b-venice": {
        "name": "Llama 3.3 70B Venice",
        "description": "Llama 3.3 70B with Venice uncensored mode",
        "context_window": 131072,
        "max_output": 4096,
        "input_price_per_1k": 0.0003,
        "output_price_per_1k": 0.0009,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["writer"]
    },
    "mistral-large-venice": {
        "name": "Mistral Large Venice",
        "description": "Mistral Large with Venice uncensored mode",
        "context_window": 128000,
        "max_output": 4096,
        "input_price_per_1k": 0.0004,
        "output_price_per_1k": 0.0012,
        "supports_vision": False,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
}


# ============================================================================
# Provider Configuration Models
# ============================================================================

class ProviderConfig(BaseModel):
    """Base configuration for an LLM provider."""
    provider: LLMProvider
    api_key: SecretStr
    base_url: Optional[str] = None
    organization_id: Optional[str] = None
    default_model: str
    enabled: bool = True


class OpenAIConfig(ProviderConfig):
    """OpenAI-specific configuration."""
    provider: LLMProvider = LLMProvider.OPENAI
    base_url: str = "https://api.openai.com/v1"
    default_model: str = "gpt-4o"

    @property
    def available_models(self) -> Dict[str, Dict[str, Any]]:
        return OPENAI_MODELS


class OpenRouterConfig(ProviderConfig):
    """OpenRouter-specific configuration."""
    provider: LLMProvider = LLMProvider.OPENROUTER
    base_url: str = "https://openrouter.ai/api/v1"
    default_model: str = "anthropic/claude-3.5-sonnet"
    site_url: Optional[str] = None  # For OpenRouter rankings
    app_name: Optional[str] = "MANOE"

    @property
    def available_models(self) -> Dict[str, Dict[str, Any]]:
        return OPENROUTER_MODELS


class GeminiConfig(ProviderConfig):
    """Google Gemini-specific configuration."""
    provider: LLMProvider = LLMProvider.GEMINI
    base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    default_model: str = "gemini-1.5-pro"

    @property
    def available_models(self) -> Dict[str, Dict[str, Any]]:
        return GEMINI_MODELS


class ClaudeConfig(ProviderConfig):
    """Anthropic Claude-specific configuration."""
    provider: LLMProvider = LLMProvider.CLAUDE
    base_url: str = "https://api.anthropic.com/v1"
    default_model: str = "claude-3-5-sonnet-20241022"
    anthropic_version: str = "2023-06-01"

    @property
    def available_models(self) -> Dict[str, Dict[str, Any]]:
        return CLAUDE_MODELS


class DeepSeekConfig(ProviderConfig):
    """DeepSeek-specific configuration (OpenAI-compatible API)."""
    provider: LLMProvider = LLMProvider.DEEPSEEK
    base_url: str = "https://api.deepseek.com"
    default_model: str = "deepseek-chat"

    @property
    def available_models(self) -> Dict[str, Dict[str, Any]]:
        return DEEPSEEK_MODELS


class VeniceConfig(ProviderConfig):
    """Venice AI-specific configuration (OpenAI-compatible API with uncensored models)."""
    provider: LLMProvider = LLMProvider.VENICE
    base_url: str = "https://api.venice.ai/api/v1"
    default_model: str = "dolphin-mistral-24b-venice"

    @property
    def available_models(self) -> Dict[str, Dict[str, Any]]:
        return VENICE_MODELS


# ============================================================================
# Agent Model Assignment
# ============================================================================

class AgentModelConfig(BaseModel):
    """Configuration for which model each agent uses."""
    architect_provider: LLMProvider = LLMProvider.OPENAI
    architect_model: str = "gpt-4o"

    profiler_provider: LLMProvider = LLMProvider.OPENAI
    profiler_model: str = "gpt-4o"

    worldbuilder_provider: LLMProvider = LLMProvider.OPENAI
    worldbuilder_model: str = "gpt-4o"

    strategist_provider: LLMProvider = LLMProvider.OPENAI
    strategist_model: str = "gpt-4o"

    writer_provider: LLMProvider = LLMProvider.OPENAI
    writer_model: str = "gpt-4o-mini"

    critic_provider: LLMProvider = LLMProvider.OPENAI
    critic_model: str = "gpt-4o"

    polish_provider: LLMProvider = LLMProvider.OPENAI
    polish_model: str = "gpt-4o"


# ============================================================================
# Master Configuration
# ============================================================================

class LLMConfiguration(BaseModel):
    """Master LLM configuration with all providers."""

    # Provider configurations (user provides their own keys)
    openai: Optional[OpenAIConfig] = None
    openrouter: Optional[OpenRouterConfig] = None
    gemini: Optional[GeminiConfig] = None
    claude: Optional[ClaudeConfig] = None
    deepseek: Optional[DeepSeekConfig] = None
    venice: Optional[VeniceConfig] = None

    # Agent-specific model assignments
    agent_models: AgentModelConfig = Field(default_factory=AgentModelConfig)

    # Global settings
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_retries: int = Field(default=3, ge=1, le=10)
    timeout_seconds: int = Field(default=120, ge=30, le=600)

    def get_provider_config(self, provider: LLMProvider) -> Optional[ProviderConfig]:
        """Get configuration for a specific provider."""
        provider_map = {
            LLMProvider.OPENAI: self.openai,
            LLMProvider.OPENROUTER: self.openrouter,
            LLMProvider.GEMINI: self.gemini,
            LLMProvider.CLAUDE: self.claude,
            LLMProvider.DEEPSEEK: self.deepseek,
            LLMProvider.VENICE: self.venice,
        }
        return provider_map.get(provider)

    def get_enabled_providers(self) -> List[LLMProvider]:
        """Get list of enabled providers."""
        enabled = []
        if self.openai and self.openai.enabled:
            enabled.append(LLMProvider.OPENAI)
        if self.openrouter and self.openrouter.enabled:
            enabled.append(LLMProvider.OPENROUTER)
        if self.gemini and self.gemini.enabled:
            enabled.append(LLMProvider.GEMINI)
        if self.claude and self.claude.enabled:
            enabled.append(LLMProvider.CLAUDE)
        if self.deepseek and self.deepseek.enabled:
            enabled.append(LLMProvider.DEEPSEEK)
        if self.venice and self.venice.enabled:
            enabled.append(LLMProvider.VENICE)
        return enabled

    def validate_agent_models(self) -> List[str]:
        """Validate that all agent models are available from enabled providers."""
        errors = []
        agent_configs = [
            ("architect", self.agent_models.architect_provider, self.agent_models.architect_model),
            ("profiler", self.agent_models.profiler_provider, self.agent_models.profiler_model),
            ("worldbuilder", self.agent_models.worldbuilder_provider, self.agent_models.worldbuilder_model),
            ("strategist", self.agent_models.strategist_provider, self.agent_models.strategist_model),
            ("writer", self.agent_models.writer_provider, self.agent_models.writer_model),
            ("critic", self.agent_models.critic_provider, self.agent_models.critic_model),
            ("polish", self.agent_models.polish_provider, self.agent_models.polish_model),
        ]

        for agent_name, provider, model in agent_configs:
            provider_config = self.get_provider_config(provider)
            if not provider_config:
                errors.append(f"{agent_name}: Provider {provider.value} is not configured")
            elif not provider_config.enabled:
                errors.append(f"{agent_name}: Provider {provider.value} is disabled")
            elif model not in provider_config.available_models:
                errors.append(f"{agent_name}: Model {model} not available for {provider.value}")

        return errors


# ============================================================================
# Helper Functions
# ============================================================================

def get_all_models() -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Get all available models grouped by provider."""
    return {
        "openai": OPENAI_MODELS,
        "openrouter": OPENROUTER_MODELS,
        "gemini": GEMINI_MODELS,
        "claude": CLAUDE_MODELS,
        "deepseek": DEEPSEEK_MODELS,
        "venice": VENICE_MODELS,
    }


def get_models_for_agent(agent_name: str) -> Dict[str, List[str]]:
    """Get recommended models for a specific agent."""
    all_models = get_all_models()
    recommended = {}

    for provider, models in all_models.items():
        provider_recommended = []
        for model_id, model_info in models.items():
            if agent_name.lower() in model_info.get("recommended_for", []):
                provider_recommended.append(model_id)
        if provider_recommended:
            recommended[provider] = provider_recommended

    return recommended


def create_default_config_from_env() -> LLMConfiguration:
    """Create configuration from environment variables."""
    import os

    config = LLMConfiguration()

    # OpenAI
    if os.getenv("OPENAI_API_KEY"):
        config.openai = OpenAIConfig(
            api_key=SecretStr(os.getenv("OPENAI_API_KEY")),
            organization_id=os.getenv("OPENAI_ORG_ID"),
        )

    # OpenRouter
    if os.getenv("OPENROUTER_API_KEY"):
        config.openrouter = OpenRouterConfig(
            api_key=SecretStr(os.getenv("OPENROUTER_API_KEY")),
            site_url=os.getenv("OPENROUTER_SITE_URL"),
        )

    # Gemini
    if os.getenv("GEMINI_API_KEY"):
        config.gemini = GeminiConfig(
            api_key=SecretStr(os.getenv("GEMINI_API_KEY")),
        )

    # Claude
    if os.getenv("ANTHROPIC_API_KEY"):
        config.claude = ClaudeConfig(
            api_key=SecretStr(os.getenv("ANTHROPIC_API_KEY")),
        )

    # DeepSeek
    if os.getenv("DEEPSEEK_API_KEY"):
        config.deepseek = DeepSeekConfig(
            api_key=SecretStr(os.getenv("DEEPSEEK_API_KEY")),
        )

    # Venice
    if os.getenv("VENICE_API_KEY"):
        config.venice = VeniceConfig(
            api_key=SecretStr(os.getenv("VENICE_API_KEY")),
        )

    return config
