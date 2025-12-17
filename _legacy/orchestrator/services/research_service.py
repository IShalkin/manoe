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

### 8. EXECUTIVE SUMMARY FOR AI AGENTS (CRITICAL)
**This section MUST be included and will be used to guide AI writing agents.**

Provide a concise summary (max 1500 words) structured as follows:
```
=== MARKET RESEARCH CONTEXT ===

TARGET AUDIENCE PROFILE:
[2-3 sentences describing the ideal audience]

KEY INSIGHTS:
- [Insight 1]
- [Insight 2]
- [Insight 3]
- [Insight 4]
- [Insight 5]

CONTENT RECOMMENDATIONS:
- Themes that resonate: [list]
- Themes to avoid: [list]
- Tone/style guidance: [brief description]

COMPETITIVE POSITIONING:
[2-3 sentences on how to differentiate]

CRITICAL SUCCESS FACTORS:
[3-5 bullet points]

=== END MARKET RESEARCH CONTEXT ===
```

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

            prompt_context = self._extract_prompt_context(content) if content else ""
            
            # Normalize citations - Perplexity returns list of URL strings,
            # but we need List[Dict] format for consistency with OpenAI
            raw_citations = data.get("citations", [])
            normalized_citations = []
            for citation in raw_citations:
                if isinstance(citation, str):
                    # Convert URL string to dict format
                    normalized_citations.append({"url": citation, "title": ""})
                elif isinstance(citation, dict):
                    normalized_citations.append(citation)
            
            return {
                "success": True,
                "provider": ResearchProvider.PERPLEXITY.value,
                "model": model,
                "content": content,
                "prompt_context": prompt_context,
                "citations": normalized_citations,
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

    def _extract_prompt_context(self, content: str) -> str:
        """
        Extract the executive summary section from research content for prompt injection.
        
        This extracts the structured summary between === MARKET RESEARCH CONTEXT ===
        markers, or generates a fallback summary if not found.
        
        Args:
            content: Full research content
            
        Returns:
            Distilled prompt context (~1500 tokens max)
        """
        import re
        
        start_marker = "=== MARKET RESEARCH CONTEXT ==="
        end_marker = "=== END MARKET RESEARCH CONTEXT ==="
        
        start_idx = content.find(start_marker)
        end_idx = content.find(end_marker)
        
        if start_idx != -1 and end_idx != -1:
            prompt_context = content[start_idx:end_idx + len(end_marker)]
            return prompt_context.strip()
        
        lines = content.split('\n')
        summary_lines = []
        in_summary = False
        
        for line in lines:
            lower_line = line.lower()
            if 'executive summary' in lower_line or 'key findings' in lower_line:
                in_summary = True
            if in_summary:
                summary_lines.append(line)
                if len('\n'.join(summary_lines)) > 6000:
                    break
        
        if summary_lines:
            return '\n'.join(summary_lines)
        
        sections_to_extract = [
            "target audience",
            "key insights",
            "recommendations",
            "competitive",
        ]
        
        extracted = []
        current_section = []
        current_header = ""
        
        for line in lines:
            if line.startswith('#') or line.startswith('**'):
                if current_section and current_header:
                    extracted.append(f"{current_header}\n" + '\n'.join(current_section[:10]))
                current_header = line
                current_section = []
                for section in sections_to_extract:
                    if section in line.lower():
                        break
            else:
                current_section.append(line)
        
        if extracted:
            result = '\n\n'.join(extracted[:4])
            return f"=== MARKET RESEARCH CONTEXT ===\n\n{result}\n\n=== END MARKET RESEARCH CONTEXT ==="
        
        truncated = content[:6000]
        if len(content) > 6000:
            truncated = truncated.rsplit('.', 1)[0] + '.'
        return f"=== MARKET RESEARCH CONTEXT ===\n\n{truncated}\n\n=== END MARKET RESEARCH CONTEXT ==="

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

        prompt_context = self._extract_prompt_context(output_text) if output_text else ""
        
        return {
            "success": True,
            "provider": ResearchProvider.OPENAI_DEEP_RESEARCH.value,
            "model": model,
            "content": output_text,
            "prompt_context": prompt_context,
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
