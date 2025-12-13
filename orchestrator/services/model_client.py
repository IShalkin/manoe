"""
UnifiedModelClient - BYOK Adapter for AutoGen
Supports OpenAI, OpenRouter, Gemini, and Anthropic providers.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import google.generativeai as genai
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from config import LLMConfiguration, LLMProvider


@dataclass
class ModelResponse:
    """Unified response from any LLM provider."""
    content: str
    model: str
    provider: LLMProvider
    usage: Dict[str, int]
    finish_reason: str


class UnifiedModelClient:
    """
    Unified model client adapter for AutoGen.
    Routes requests to appropriate provider based on configuration.
    Supports BYOK (Bring Your Own Key) for all providers.
    """

    def __init__(self, config: LLMConfiguration):
        self.config = config
        self._openai_client: Optional[AsyncOpenAI] = None
        self._openrouter_client: Optional[AsyncOpenAI] = None
        self._deepseek_client: Optional[AsyncOpenAI] = None
        self._anthropic_client: Optional[AsyncAnthropic] = None
        self._gemini_configured = False

    def _get_openai_client(self) -> AsyncOpenAI:
        """Get or create OpenAI client."""
        if self._openai_client is None:
            if not self.config.openai:
                raise ValueError("OpenAI configuration not provided")
            self._openai_client = AsyncOpenAI(
                api_key=self.config.openai.api_key.get_secret_value(),
                base_url=self.config.openai.base_url,
            )
        return self._openai_client

    def _get_openrouter_client(self) -> AsyncOpenAI:
        """Get or create OpenRouter client (OpenAI-compatible)."""
        if self._openrouter_client is None:
            if not self.config.openrouter:
                raise ValueError("OpenRouter configuration not provided")
            self._openrouter_client = AsyncOpenAI(
                api_key=self.config.openrouter.api_key.get_secret_value(),
                base_url=self.config.openrouter.base_url,
            )
        return self._openrouter_client

    def _get_deepseek_client(self) -> AsyncOpenAI:
        """Get or create DeepSeek client (OpenAI-compatible)."""
        if self._deepseek_client is None:
            if not self.config.deepseek:
                raise ValueError("DeepSeek configuration not provided")
            self._deepseek_client = AsyncOpenAI(
                api_key=self.config.deepseek.api_key.get_secret_value(),
                base_url=self.config.deepseek.base_url,
            )
        return self._deepseek_client

    def _get_anthropic_client(self) -> AsyncAnthropic:
        """Get or create Anthropic client."""
        if self._anthropic_client is None:
            if not self.config.claude:
                raise ValueError("Claude configuration not provided")
            self._anthropic_client = AsyncAnthropic(
                api_key=self.config.claude.api_key.get_secret_value(),
            )
        return self._anthropic_client

    def _configure_gemini(self) -> None:
        """Configure Gemini API."""
        if not self._gemini_configured:
            if not self.config.gemini:
                raise ValueError("Gemini configuration not provided")
            genai.configure(api_key=self.config.gemini.api_key.get_secret_value())
            self._gemini_configured = True

    async def create_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        provider: LLMProvider,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        response_format: Optional[Dict[str, str]] = None,
    ) -> ModelResponse:
        """
        Create a chat completion using the specified provider.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model identifier
            provider: LLM provider to use
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
            response_format: Optional format specification (e.g., {"type": "json_object"})

        Returns:
            ModelResponse with unified response format
        """
        if provider == LLMProvider.OPENAI:
            return await self._openai_completion(
                messages, model, temperature, max_tokens, response_format
            )
        elif provider == LLMProvider.OPENROUTER:
            return await self._openrouter_completion(
                messages, model, temperature, max_tokens, response_format
            )
        elif provider == LLMProvider.CLAUDE:
            return await self._anthropic_completion(
                messages, model, temperature, max_tokens, response_format
            )
        elif provider == LLMProvider.GEMINI:
            return await self._gemini_completion(
                messages, model, temperature, max_tokens, response_format
            )
        elif provider == LLMProvider.DEEPSEEK:
            return await self._deepseek_completion(
                messages, model, temperature, max_tokens, response_format
            )
        else:
            raise ValueError(f"Unsupported provider: {provider}")

    async def _openai_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        response_format: Optional[Dict[str, str]],
    ) -> ModelResponse:
        """Create completion using OpenAI API."""
        client = self._get_openai_client()

        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if response_format:
            kwargs["response_format"] = response_format

        response = await client.chat.completions.create(**kwargs)

        return ModelResponse(
            content=response.choices[0].message.content or "",
            model=model,
            provider=LLMProvider.OPENAI,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            finish_reason=response.choices[0].finish_reason or "stop",
        )

    async def _openrouter_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        response_format: Optional[Dict[str, str]],
    ) -> ModelResponse:
        """Create completion using OpenRouter API (OpenAI-compatible)."""
        client = self._get_openrouter_client()

        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if response_format:
            kwargs["response_format"] = response_format

        response = await client.chat.completions.create(**kwargs)

        return ModelResponse(
            content=response.choices[0].message.content or "",
            model=model,
            provider=LLMProvider.OPENROUTER,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            finish_reason=response.choices[0].finish_reason or "stop",
        )

    async def _deepseek_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        response_format: Optional[Dict[str, str]],
    ) -> ModelResponse:
        """Create completion using DeepSeek API (OpenAI-compatible)."""
        client = self._get_deepseek_client()

        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if response_format:
            kwargs["response_format"] = response_format

        response = await client.chat.completions.create(**kwargs)

        return ModelResponse(
            content=response.choices[0].message.content or "",
            model=model,
            provider=LLMProvider.DEEPSEEK,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            finish_reason=response.choices[0].finish_reason or "stop",
        )

    async def _anthropic_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        response_format: Optional[Dict[str, str]],
    ) -> ModelResponse:
        """Create completion using Anthropic API."""
        client = self._get_anthropic_client()

        # Extract system message if present
        system_message = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_message = msg["content"]
            else:
                chat_messages.append(msg)

        # Add JSON instruction if response_format is json
        if response_format and response_format.get("type") == "json_object":
            system_message += "\n\nYou MUST respond with valid JSON only, no other text."

        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens or 4096,
            system=system_message,
            messages=chat_messages,
            temperature=temperature,
        )

        content = response.content[0].text if response.content else ""

        return ModelResponse(
            content=content,
            model=model,
            provider=LLMProvider.CLAUDE,
            usage={
                "prompt_tokens": response.usage.input_tokens if response.usage else 0,
                "completion_tokens": response.usage.output_tokens if response.usage else 0,
                "total_tokens": (
                    (response.usage.input_tokens + response.usage.output_tokens)
                    if response.usage else 0
                ),
            },
            finish_reason=response.stop_reason or "stop",
        )

    async def _gemini_completion(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: Optional[int],
        response_format: Optional[Dict[str, str]],
    ) -> ModelResponse:
        """Create completion using Google Gemini API."""
        self._configure_gemini()

        # Build prompt from messages
        system_content = ""
        user_content = ""
        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            elif msg["role"] == "user":
                user_content = msg["content"]
            elif msg["role"] == "assistant":
                user_content += f"\n\nAssistant: {msg['content']}"

        full_prompt = f"{system_content}\n\n---\n\n{user_content}"

        # Add JSON instruction if response_format is json
        if response_format and response_format.get("type") == "json_object":
            full_prompt += "\n\nYou MUST respond with valid JSON only, no other text."

        gemini_model = genai.GenerativeModel(model)
        response = await gemini_model.generate_content_async(
            full_prompt,
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            },
        )

        return ModelResponse(
            content=response.text or "",
            model=model,
            provider=LLMProvider.GEMINI,
            usage={
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
            finish_reason="stop",
        )

    def get_autogen_config(
        self,
        provider: LLMProvider,
        model: str,
    ) -> Dict[str, Any]:
        """
        Get AutoGen-compatible configuration for a specific provider/model.

        Returns a config dict that can be used with AutoGen's AssistantAgent.
        """
        if provider == LLMProvider.OPENAI:
            if not self.config.openai:
                raise ValueError("OpenAI configuration not provided")
            return {
                "model": model,
                "api_key": self.config.openai.api_key.get_secret_value(),
                "base_url": self.config.openai.base_url,
            }
        elif provider == LLMProvider.OPENROUTER:
            if not self.config.openrouter:
                raise ValueError("OpenRouter configuration not provided")
            return {
                "model": model,
                "api_key": self.config.openrouter.api_key.get_secret_value(),
                "base_url": self.config.openrouter.base_url,
            }
        elif provider == LLMProvider.CLAUDE:
            if not self.config.claude:
                raise ValueError("Claude configuration not provided")
            return {
                "model": model,
                "api_key": self.config.claude.api_key.get_secret_value(),
                "api_type": "anthropic",
            }
        elif provider == LLMProvider.GEMINI:
            if not self.config.gemini:
                raise ValueError("Gemini configuration not provided")
            return {
                "model": model,
                "api_key": self.config.gemini.api_key.get_secret_value(),
                "api_type": "google",
            }
        elif provider == LLMProvider.DEEPSEEK:
            if not self.config.deepseek:
                raise ValueError("DeepSeek configuration not provided")
            return {
                "model": model,
                "api_key": self.config.deepseek.api_key.get_secret_value(),
                "base_url": self.config.deepseek.base_url,
            }
        else:
            raise ValueError(f"Unsupported provider: {provider}")
