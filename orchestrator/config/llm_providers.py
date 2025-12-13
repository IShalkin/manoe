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


# ============================================================================
# Model Definitions by Provider
# ============================================================================

OPENAI_MODELS: Dict[str, Dict[str, Any]] = {
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
        "recommended_for": ["architect", "profiler", "strategist", "critic"]
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
    "gpt-4-turbo": {
        "name": "GPT-4 Turbo",
        "description": "GPT-4 Turbo with vision capabilities",
        "context_window": 128000,
        "max_output": 4096,
        "input_price_per_1k": 0.01,
        "output_price_per_1k": 0.03,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "critic"]
    },
    "gpt-4": {
        "name": "GPT-4",
        "description": "Original GPT-4 model",
        "context_window": 8192,
        "max_output": 8192,
        "input_price_per_1k": 0.03,
        "output_price_per_1k": 0.06,
        "supports_vision": False,
        "supports_function_calling": True,
        "recommended_for": ["architect", "critic"]
    },
    # GPT-3.5 Family
    "gpt-3.5-turbo": {
        "name": "GPT-3.5 Turbo",
        "description": "Fast and cost-effective",
        "context_window": 16385,
        "max_output": 4096,
        "input_price_per_1k": 0.0005,
        "output_price_per_1k": 0.0015,
        "supports_vision": False,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
    # O1 Reasoning Models
    "o1-preview": {
        "name": "O1 Preview",
        "description": "Advanced reasoning model",
        "context_window": 128000,
        "max_output": 32768,
        "input_price_per_1k": 0.015,
        "output_price_per_1k": 0.06,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["architect", "strategist"]
    },
    "o1-mini": {
        "name": "O1 Mini",
        "description": "Smaller reasoning model",
        "context_window": 128000,
        "max_output": 65536,
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.012,
        "supports_vision": False,
        "supports_function_calling": False,
        "recommended_for": ["strategist"]
    },
}

OPENROUTER_MODELS: Dict[str, Dict[str, Any]] = {
    # OpenAI via OpenRouter
    "openai/gpt-4o": {
        "name": "GPT-4o (via OpenRouter)",
        "description": "OpenAI GPT-4o through OpenRouter",
        "context_window": 128000,
        "max_output": 16384,
        "recommended_for": ["architect", "profiler", "strategist", "critic"]
    },
    "openai/gpt-4o-mini": {
        "name": "GPT-4o Mini (via OpenRouter)",
        "description": "OpenAI GPT-4o Mini through OpenRouter",
        "context_window": 128000,
        "max_output": 16384,
        "recommended_for": ["writer"]
    },
    # Anthropic via OpenRouter
    "anthropic/claude-3.5-sonnet": {
        "name": "Claude 3.5 Sonnet (via OpenRouter)",
        "description": "Anthropic Claude 3.5 Sonnet through OpenRouter",
        "context_window": 200000,
        "max_output": 8192,
        "recommended_for": ["architect", "profiler", "critic", "writer"]
    },
    "anthropic/claude-3-opus": {
        "name": "Claude 3 Opus (via OpenRouter)",
        "description": "Anthropic Claude 3 Opus through OpenRouter",
        "context_window": 200000,
        "max_output": 4096,
        "recommended_for": ["architect", "critic"]
    },
    # Google via OpenRouter
    "google/gemini-pro-1.5": {
        "name": "Gemini Pro 1.5 (via OpenRouter)",
        "description": "Google Gemini Pro 1.5 through OpenRouter",
        "context_window": 1000000,
        "max_output": 8192,
        "recommended_for": ["strategist", "writer"]
    },
    # Meta Llama via OpenRouter
    "meta-llama/llama-3.1-405b-instruct": {
        "name": "Llama 3.1 405B (via OpenRouter)",
        "description": "Meta Llama 3.1 405B Instruct",
        "context_window": 131072,
        "max_output": 4096,
        "recommended_for": ["writer"]
    },
    "meta-llama/llama-3.1-70b-instruct": {
        "name": "Llama 3.1 70B (via OpenRouter)",
        "description": "Meta Llama 3.1 70B Instruct",
        "context_window": 131072,
        "max_output": 4096,
        "recommended_for": ["writer"]
    },
    # Mistral via OpenRouter
    "mistralai/mistral-large": {
        "name": "Mistral Large (via OpenRouter)",
        "description": "Mistral AI Large model",
        "context_window": 128000,
        "max_output": 4096,
        "recommended_for": ["writer", "profiler"]
    },
    "mistralai/mixtral-8x22b-instruct": {
        "name": "Mixtral 8x22B (via OpenRouter)",
        "description": "Mistral AI Mixtral 8x22B",
        "context_window": 65536,
        "max_output": 4096,
        "recommended_for": ["writer"]
    },
    # DeepSeek via OpenRouter
    "deepseek/deepseek-chat": {
        "name": "DeepSeek Chat (via OpenRouter)",
        "description": "DeepSeek Chat model",
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
    "gemini-2.0-flash-exp": {
        "name": "Gemini 2.0 Flash (Experimental)",
        "description": "Latest Gemini 2.0 Flash experimental model",
        "context_window": 1000000,
        "max_output": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "strategist", "writer"]
    },
    "gemini-1.5-pro": {
        "name": "Gemini 1.5 Pro",
        "description": "Most capable Gemini model with 1M context",
        "context_window": 1000000,
        "max_output": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "profiler", "strategist", "critic"]
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
    "gemini-1.5-flash-8b": {
        "name": "Gemini 1.5 Flash 8B",
        "description": "Smallest and fastest Gemini model",
        "context_window": 1000000,
        "max_output": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
    "gemini-1.0-pro": {
        "name": "Gemini 1.0 Pro",
        "description": "Original Gemini Pro model",
        "context_window": 32760,
        "max_output": 8192,
        "supports_vision": False,
        "supports_function_calling": True,
        "recommended_for": ["writer"]
    },
}

CLAUDE_MODELS: Dict[str, Dict[str, Any]] = {
    "claude-3-5-sonnet-20241022": {
        "name": "Claude 3.5 Sonnet (Latest)",
        "description": "Most intelligent Claude model, best for complex tasks",
        "context_window": 200000,
        "max_output": 8192,
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.015,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "profiler", "strategist", "critic", "writer"]
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
    "claude-3-opus-20240229": {
        "name": "Claude 3 Opus",
        "description": "Most powerful Claude 3 model for complex reasoning",
        "context_window": 200000,
        "max_output": 4096,
        "input_price_per_1k": 0.015,
        "output_price_per_1k": 0.075,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["architect", "critic"]
    },
    "claude-3-sonnet-20240229": {
        "name": "Claude 3 Sonnet",
        "description": "Balanced Claude 3 model",
        "context_window": 200000,
        "max_output": 4096,
        "input_price_per_1k": 0.003,
        "output_price_per_1k": 0.015,
        "supports_vision": True,
        "supports_function_calling": True,
        "recommended_for": ["profiler", "strategist"]
    },
    "claude-3-haiku-20240307": {
        "name": "Claude 3 Haiku",
        "description": "Fastest Claude 3 model",
        "context_window": 200000,
        "max_output": 4096,
        "input_price_per_1k": 0.00025,
        "output_price_per_1k": 0.00125,
        "supports_vision": True,
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


# ============================================================================
# Agent Model Assignment
# ============================================================================

class AgentModelConfig(BaseModel):
    """Configuration for which model each agent uses."""
    architect_provider: LLMProvider = LLMProvider.OPENAI
    architect_model: str = "gpt-4o"

    profiler_provider: LLMProvider = LLMProvider.OPENAI
    profiler_model: str = "gpt-4o"

    strategist_provider: LLMProvider = LLMProvider.OPENAI
    strategist_model: str = "gpt-4o"

    writer_provider: LLMProvider = LLMProvider.OPENAI
    writer_model: str = "gpt-4o-mini"

    critic_provider: LLMProvider = LLMProvider.OPENAI
    critic_model: str = "gpt-4o"


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
        return enabled

    def validate_agent_models(self) -> List[str]:
        """Validate that all agent models are available from enabled providers."""
        errors = []
        agent_configs = [
            ("architect", self.agent_models.architect_provider, self.agent_models.architect_model),
            ("profiler", self.agent_models.profiler_provider, self.agent_models.profiler_model),
            ("strategist", self.agent_models.strategist_provider, self.agent_models.strategist_model),
            ("writer", self.agent_models.writer_provider, self.agent_models.writer_model),
            ("critic", self.agent_models.critic_provider, self.agent_models.critic_model),
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

    return config
