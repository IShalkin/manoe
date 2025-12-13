"""
Base Agent Implementation for MANOE
Provides common functionality for all narrative agents.
"""

import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Type, TypeVar

from pydantic import BaseModel

from ..config import LLMConfiguration, LLMProvider
from ..models import AgentEvent

T = TypeVar("T", bound=BaseModel)


class LLMClient(ABC):
    """Abstract base class for LLM clients."""

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Generate a response from the LLM."""
        pass

    @abstractmethod
    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
        temperature: float = 0.7,
    ) -> T:
        """Generate a structured response from the LLM."""
        pass


class OpenAIClient(LLMClient):
    """OpenAI API client implementation."""

    def __init__(self, api_key: str, model: str, base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self._client = None

    async def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
        return self._client

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        client = await self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
        temperature: float = 0.7,
    ) -> T:
        client = await self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        return response_model.model_validate_json(content)


class ClaudeClient(LLMClient):
    """Anthropic Claude API client implementation."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self._client = None

    async def _get_client(self):
        if self._client is None:
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=self.api_key)
        return self._client

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        client = await self._get_client()
        response = await client.messages.create(
            model=self.model,
            max_tokens=max_tokens or 4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=temperature,
        )
        return response.content[0].text

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
        temperature: float = 0.7,
    ) -> T:
        # Add JSON instruction to system prompt
        json_system = f"{system_prompt}\n\nYou MUST respond with valid JSON only, no other text."
        content = await self.generate(json_system, user_prompt, temperature)
        # Extract JSON from response
        try:
            return response_model.model_validate_json(content)
        except Exception:
            # Try to extract JSON from markdown code block
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0].strip()
                return response_model.model_validate_json(json_str)
            raise


class GeminiClient(LLMClient):
    """Google Gemini API client implementation."""

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self._client = None

    async def _get_client(self):
        if self._client is None:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            self._client = genai.GenerativeModel(self.model)
        return self._client

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        client = await self._get_client()
        full_prompt = f"{system_prompt}\n\n---\n\n{user_prompt}"
        response = await client.generate_content_async(
            full_prompt,
            generation_config={"temperature": temperature, "max_output_tokens": max_tokens},
        )
        return response.text

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
        temperature: float = 0.7,
    ) -> T:
        json_system = f"{system_prompt}\n\nYou MUST respond with valid JSON only, no other text."
        content = await self.generate(json_system, user_prompt, temperature)
        try:
            return response_model.model_validate_json(content)
        except Exception:
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0].strip()
                return response_model.model_validate_json(json_str)
            raise


def create_llm_client(
    provider: LLMProvider,
    config: LLMConfiguration,
    model: str,
) -> LLMClient:
    """Factory function to create appropriate LLM client."""

    if provider == LLMProvider.OPENAI:
        if not config.openai:
            raise ValueError("OpenAI configuration not provided")
        return OpenAIClient(
            api_key=config.openai.api_key.get_secret_value(),
            model=model,
            base_url=config.openai.base_url,
        )

    elif provider == LLMProvider.OPENROUTER:
        if not config.openrouter:
            raise ValueError("OpenRouter configuration not provided")
        return OpenAIClient(  # OpenRouter uses OpenAI-compatible API
            api_key=config.openrouter.api_key.get_secret_value(),
            model=model,
            base_url=config.openrouter.base_url,
        )

    elif provider == LLMProvider.CLAUDE:
        if not config.claude:
            raise ValueError("Claude configuration not provided")
        return ClaudeClient(
            api_key=config.claude.api_key.get_secret_value(),
            model=model,
        )

    elif provider == LLMProvider.GEMINI:
        if not config.gemini:
            raise ValueError("Gemini configuration not provided")
        return GeminiClient(
            api_key=config.gemini.api_key.get_secret_value(),
            model=model,
        )

    else:
        raise ValueError(f"Unsupported provider: {provider}")


class BaseAgent(ABC):
    """Base class for all MANOE agents."""

    def __init__(
        self,
        name: str,
        llm_client: LLMClient,
        system_prompt: str,
    ):
        self.name = name
        self.llm_client = llm_client
        self.system_prompt = system_prompt

    @abstractmethod
    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process input and generate output."""
        pass

    async def generate_with_logging(
        self,
        user_prompt: str,
        response_model: Type[T],
        project_id: str,
        temperature: float = 0.7,
    ) -> tuple[T, AgentEvent]:
        """Generate response with audit logging."""
        start_time = time.time()

        result = await self.llm_client.generate_structured(
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            response_model=response_model,
            temperature=temperature,
        )

        duration_ms = int((time.time() - start_time) * 1000)

        event = AgentEvent(
            project_id=project_id,
            agent_name=self.name,
            action="generate",
            input_summary=user_prompt[:500] + "..." if len(user_prompt) > 500 else user_prompt,
            output_summary=str(result)[:500] + "..." if len(str(result)) > 500 else str(result),
            token_usage={},  # Would be populated from actual API response
            duration_ms=duration_ms,
        )

        return result, event
