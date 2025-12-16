"""
Research Service for MANOE
Integrates OpenAI Deep Research and Perplexity APIs for market research.
"""

import asyncio
import json
import time
from enum import Enum
from typing import Any, Dict, List, Optional

import httpx


class ResearchProvider(str, Enum):
    """Supported research providers."""
    OPENAI_DEEP_RESEARCH = "openai_deep_research"
    PERPLEXITY = "perplexity"


class ResearchService:
    """
    Service for conducting market research using OpenAI Deep Research or Perplexity APIs.
    """

    OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
    PERPLEXITY_CHAT_URL = "https://api.perplexity.ai/chat/completions"

    OPENAI_DEEP_RESEARCH_MODELS = [
        "o3-deep-research-2025-06-26",
        "o4-mini-deep-research-2025-06-26",
    ]

    PERPLEXITY_MODELS = [
        "sonar-deep-research",
    ]

    def __init__(self):
        self.http_client: Optional[httpx.AsyncClient] = None

    async def initialize(self) -> None:
        """Initialize HTTP client."""
        self.http_client = httpx.AsyncClient(timeout=httpx.Timeout(600.0))

    async def shutdown(self) -> None:
        """Shutdown HTTP client."""
        if self.http_client:
            await self.http_client.aclose()

    def _build_research_prompt(
        self,
        seed_idea: str,
        target_audience: str,
        themes: List[str],
        moral_compass: str,
    ) -> str:
        """Build a comprehensive market research prompt."""
        themes_str = ", ".join(themes) if themes else "Not specified"

        return f"""Conduct a comprehensive market research analysis for a storytelling/entertainment project with the following parameters:

## Project Overview
**Seed Idea:** {seed_idea}
**Target Audience:** {target_audience or "General adult readers"}
**Core Themes:** {themes_str}
**Moral Compass:** {moral_compass}

## Research Requirements

Please provide a detailed market research report covering:

### 1. Target Audience Analysis
- Demographics (age, gender, location, income level)
- Psychographics (interests, values, lifestyle)
- Media consumption habits
- Platform preferences (streaming, reading, gaming)
- Spending patterns on entertainment

### 2. Market Landscape
- Current market size and growth trends
- Key competitors and comparable works
- Recent successful projects in similar genres/themes
- Market gaps and opportunities
- Emerging trends in the entertainment industry

### 3. Audience Sentiment & Preferences
- What themes resonate with this audience?
- What are common complaints about existing content?
- What formats are preferred (novels, films, series, games)?
- Price sensitivity and willingness to pay

### 4. Distribution & Marketing Channels
- Most effective marketing channels for this audience
- Social media platforms with highest engagement
- Influencer landscape and key opinion leaders
- Traditional vs digital marketing effectiveness

### 5. Competitive Analysis
- Top 5 comparable works/projects
- Their strengths and weaknesses
- Pricing strategies
- Marketing approaches that worked

### 6. Risk Assessment
- Potential market risks
- Audience fatigue factors
- Timing considerations
- Cultural sensitivity issues

### 7. Recommendations
- Optimal positioning strategy
- Key differentiators to emphasize
- Suggested marketing approach
- Timing recommendations

Please include specific data points, statistics, and citations where available. Focus on actionable insights that can inform creative and business decisions."""

    async def research_with_perplexity(
        self,
        api_key: str,
        seed_idea: str,
        target_audience: str,
        themes: List[str],
        moral_compass: str,
        model: str = "sonar-deep-research",
    ) -> Dict[str, Any]:
        """
        Conduct market research using Perplexity's Sonar Deep Research API.

        Args:
            api_key: Perplexity API key
            seed_idea: The story/project seed idea
            target_audience: Target audience description
            themes: List of themes
            moral_compass: Moral compass setting
            model: Perplexity model to use

        Returns:
            Research results with citations
        """
        if not self.http_client:
            await self.initialize()

        prompt = self._build_research_prompt(seed_idea, target_audience, themes, moral_compass)

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        }

        try:
            response = await self.http_client.post(
                self.PERPLEXITY_CHAT_URL,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            content = ""
            if data.get("choices") and len(data["choices"]) > 0:
                content = data["choices"][0].get("message", {}).get("content", "")

            return {
                "success": True,
                "provider": ResearchProvider.PERPLEXITY.value,
                "model": model,
                "content": content,
                "citations": data.get("citations", []),
                "search_results": data.get("search_results", []),
                "usage": data.get("usage", {}),
            }

        except httpx.HTTPStatusError as e:
            return {
                "success": False,
                "provider": ResearchProvider.PERPLEXITY.value,
                "error": f"HTTP error: {e.response.status_code} - {e.response.text}",
            }
        except Exception as e:
            return {
                "success": False,
                "provider": ResearchProvider.PERPLEXITY.value,
                "error": str(e),
            }

    async def research_with_openai_deep_research(
        self,
        api_key: str,
        seed_idea: str,
        target_audience: str,
        themes: List[str],
        moral_compass: str,
        model: str = "o4-mini-deep-research-2025-06-26",
        max_wait_seconds: int = 600,
    ) -> Dict[str, Any]:
        """
        Conduct market research using OpenAI's Deep Research API.

        Uses the Responses API with background mode for long-running research tasks.

        Args:
            api_key: OpenAI API key
            seed_idea: The story/project seed idea
            target_audience: Target audience description
            themes: List of themes
            moral_compass: Moral compass setting
            model: OpenAI Deep Research model to use
            max_wait_seconds: Maximum time to wait for completion

        Returns:
            Research results with citations
        """
        if not self.http_client:
            await self.initialize()

        prompt = self._build_research_prompt(seed_idea, target_audience, themes, moral_compass)

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "input": prompt,
            "background": True,
            "tools": [
                {"type": "web_search_preview"},
            ],
        }

        try:
            response = await self.http_client.post(
                self.OPENAI_RESPONSES_URL,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            response_id = data.get("id")
            status = data.get("status")

            if status == "completed":
                return self._parse_openai_response(data, model)

            if not response_id:
                return {
                    "success": False,
                    "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
                    "error": "No response ID returned from API",
                }

            result = await self._poll_openai_response(
                api_key, response_id, max_wait_seconds
            )
            return result

        except httpx.HTTPStatusError as e:
            return {
                "success": False,
                "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
                "error": f"HTTP error: {e.response.status_code} - {e.response.text}",
            }
        except Exception as e:
            return {
                "success": False,
                "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
                "error": str(e),
            }

    async def _poll_openai_response(
        self,
        api_key: str,
        response_id: str,
        max_wait_seconds: int,
    ) -> Dict[str, Any]:
        """Poll OpenAI for response completion."""
        headers = {
            "Authorization": f"Bearer {api_key}",
        }

        poll_url = f"{self.OPENAI_RESPONSES_URL}/{response_id}"
        start_time = time.time()
        poll_interval = 5

        while time.time() - start_time < max_wait_seconds:
            try:
                response = await self.http_client.get(poll_url, headers=headers)
                response.raise_for_status()
                data = response.json()

                status = data.get("status")

                if status == "completed":
                    return self._parse_openai_response(data, data.get("model", ""))

                if status in ["failed", "cancelled"]:
                    error_msg = data.get("error", {}).get("message", "Unknown error")
                    return {
                        "success": False,
                        "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
                        "error": f"Research {status}: {error_msg}",
                    }

                await asyncio.sleep(poll_interval)

            except Exception as e:
                return {
                    "success": False,
                    "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
                    "error": f"Polling error: {str(e)}",
                }

        return {
            "success": False,
            "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
            "error": f"Research timed out after {max_wait_seconds} seconds",
        }

    def _parse_openai_response(self, data: Dict[str, Any], model: str) -> Dict[str, Any]:
        """Parse OpenAI Deep Research response."""
        output_text = data.get("output_text", "")

        output_items = data.get("output", [])
        citations = []
        web_searches = []

        for item in output_items:
            item_type = item.get("type")
            if item_type == "web_search_call":
                web_searches.append({
                    "action": item.get("action"),
                    "query": item.get("query", ""),
                })
            elif item_type == "message":
                content = item.get("content", [])
                for c in content:
                    if c.get("type") == "output_text":
                        annotations = c.get("annotations", [])
                        for ann in annotations:
                            if ann.get("type") == "url_citation":
                                citations.append({
                                    "url": ann.get("url"),
                                    "title": ann.get("title", ""),
                                })

        return {
            "success": True,
            "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
            "model": model,
            "content": output_text,
            "citations": citations,
            "web_searches": web_searches,
            "usage": data.get("usage", {}),
        }

    async def conduct_research(
        self,
        provider: str,
        api_key: str,
        seed_idea: str,
        target_audience: str,
        themes: List[str],
        moral_compass: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Conduct market research using the specified provider.

        Args:
            provider: Research provider (openai_deep_research or perplexity)
            api_key: API key for the provider
            seed_idea: The story/project seed idea
            target_audience: Target audience description
            themes: List of themes
            moral_compass: Moral compass setting
            model: Optional model override

        Returns:
            Research results
        """
        if provider == ResearchProvider.PERPLEXITY.value:
            return await self.research_with_perplexity(
                api_key=api_key,
                seed_idea=seed_idea,
                target_audience=target_audience,
                themes=themes,
                moral_compass=moral_compass,
                model=model or "sonar-deep-research",
            )
        elif provider == ResearchProvider.OPENAI_DEEP_RESEARCH.value:
            return await self.research_with_openai_deep_research(
                api_key=api_key,
                seed_idea=seed_idea,
                target_audience=target_audience,
                themes=themes,
                moral_compass=moral_compass,
                model=model or "o4-mini-deep-research-2025-06-26",
            )
        else:
            return {
                "success": False,
                "error": f"Unknown research provider: {provider}",
            }
