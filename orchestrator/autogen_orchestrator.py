"""
AutoGen-based Storyteller Group Chat Orchestrator
Implements multi-agent narrative generation with real agent communication.
"""

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

# Configure logging for orchestrator
logger = logging.getLogger("orchestrator")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))
    logger.addHandler(handler)

from autogen_agentchat.agents import AssistantAgent

from config import LLMConfiguration, LLMProvider
from models import (
    StoryProject,
)
from prompts import (
    ARCHITECT_SYSTEM_PROMPT,
    ARCHIVIST_SYSTEM_PROMPT,
    ARCHIVIST_USER_PROMPT_TEMPLATE,
    COMPLEXITY_CHECKLIST_PROMPT,
    CONTRADICTION_MAPS_PROMPT,
    CRITIC_SYSTEM_PROMPT,
    DEEPENING_CHECKPOINT_PROMPT,
    EMOTIONAL_BEAT_SHEET_PROMPT,
    IMPACT_ASSESSMENT_SYSTEM_PROMPT,
    NARRATOR_DESIGN_PROMPT,
    NARRATIVE_POSSIBILITIES_PROMPT,
    ORIGINALITY_CHECK_SYSTEM_PROMPT,
    POLISH_SYSTEM_PROMPT,
    PROFILER_SYSTEM_PROMPT,
    SENSORY_BLUEPRINT_PROMPT,
    STRATEGIST_SYSTEM_PROMPT,
    SUBTEXT_DESIGN_PROMPT,
    SYMBOLIC_MOTIF_LAYER_PROMPT,
    WORLDBUILDER_SYSTEM_PROMPT,
    WRITER_SYSTEM_PROMPT,
)
from services.model_client import UnifiedModelClient
from services.qdrant_memory import QdrantMemoryService
from services.supabase_persistence import SupabasePersistenceService


class GenerationPhase(str, Enum):
    """Current phase of story generation."""
    GENESIS = "genesis"
    CHARACTERS = "characters"
    WORLDBUILDING = "worldbuilding"
    OUTLINING = "outlining"
    DRAFTING = "drafting"
    CRITIQUE = "critique"
    REVISION = "revision"
    ORIGINALITY_CHECK = "originality_check"
    IMPACT_ASSESSMENT = "impact_assessment"
    POLISH = "polish"


# Dynamic max_tokens limits based on phase/task type
# These are tuned for the expected output size of each phase
PHASE_MAX_TOKENS = {
    # High token phases - complex JSON structures or long prose
    GenerationPhase.OUTLINING: 16384,      # 20+ scenes with detailed info
    GenerationPhase.DRAFTING: 16384,       # Long prose scenes (2000-3000 words)
    GenerationPhase.REVISION: 16384,       # Revised scenes can be long
    GenerationPhase.POLISH: 12288,         # Polished prose
    
    # Medium token phases - structured JSON responses
    GenerationPhase.WORLDBUILDING: 12288,  # Detailed world info
    GenerationPhase.CHARACTERS: 10240,     # Multiple character profiles
    GenerationPhase.GENESIS: 8192,         # Narrative possibilities
    GenerationPhase.IMPACT_ASSESSMENT: 8192,
    
    # Lower token phases - shorter responses
    GenerationPhase.CRITIQUE: 6144,        # Feedback and suggestions
    GenerationPhase.ORIGINALITY_CHECK: 4096,
}

DEFAULT_MAX_TOKENS = 8192  # Fallback for unknown phases


def get_max_tokens_for_phase(phase: Optional[GenerationPhase]) -> int:
    """Get appropriate max_tokens limit based on current phase.
    
    This provides dynamic token limits based on the expected output size
    of each phase, rather than hardcoding per-agent limits.
    """
    if phase is None:
        return DEFAULT_MAX_TOKENS
    return PHASE_MAX_TOKENS.get(phase, DEFAULT_MAX_TOKENS)


@dataclass
class AgentMessage:
    """Structured message between agents."""
    type: str  # artifact, question, objection, revision_request, response
    from_agent: str
    to_agent: Optional[str] = None
    content: Any = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class GenerationState:
    """State tracking for the generation process."""
    phase: GenerationPhase
    project_id: str
    narrative: Optional[Dict] = None
    characters: List[Dict] = field(default_factory=list)
    worldbuilding: Optional[Dict] = None
    outline: Optional[Dict] = None
    current_scene: int = 0
    drafts: Dict[int, Dict] = field(default_factory=dict)
    critiques: Dict[int, List[Dict]] = field(default_factory=dict)
    revision_count: Dict[int, int] = field(default_factory=dict)
    messages: List[AgentMessage] = field(default_factory=list)
    max_revisions: int = 2
    # Constraint Resolution (Archivist Agent)
    key_constraints: Dict[str, Dict] = field(default_factory=dict)  # key -> KeyConstraint dict
    raw_facts_log: List[Dict] = field(default_factory=list)  # Append-only log of raw facts
    last_archivist_scene: int = 0  # Last scene where Archivist ran


def _safe_join(items: List[Any], separator: str = ", ") -> str:
    """Safely join a list of items, converting dicts to strings if needed."""
    if not items:
        return ""
    result = []
    for item in items:
        if isinstance(item, dict):
            # Extract a meaningful string from the dict
            if "name" in item:
                result.append(str(item["name"]))
            elif "title" in item:
                result.append(str(item["title"]))
            else:
                result.append(json.dumps(item, ensure_ascii=False))
        elif isinstance(item, str):
            result.append(item)
        else:
            result.append(str(item))
    return separator.join(result)


def _normalize_dict(value: Any, fallback_key: str = "description") -> Dict[str, Any]:
    """
    Normalize a value to a dict, handling cases where LLM returns a string instead of dict.
    
    This is a defensive helper to handle schema drift in LLM outputs.
    
    Args:
        value: The value to normalize (could be dict, str, or None)
        fallback_key: Key to use when wrapping a string value into a dict
        
    Returns:
        A dict (possibly empty if value was None/invalid)
    """
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        # Try to parse as JSON first (in case it's a serialized dict)
        if value.strip().startswith("{"):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        # Wrap string in a dict to preserve information
        logger.warning(f"[_normalize_dict] Expected dict but got string (len={len(value)}), wrapping with key '{fallback_key}'")
        return {fallback_key: value}
    # For other types, return empty dict
    logger.warning(f"[_normalize_dict] Expected dict but got {type(value).__name__}, returning empty dict")
    return {}


class StorytellerGroupChat:
    """
    AutoGen-based multi-agent group chat for narrative generation.

    Implements real agent communication with:
    - Questions between agents
    - Objections and challenges
    - Writer↔Critic revision loop (max 2 revisions)
    - Phase-based speaker selection
    """

    def __init__(
        self,
        config: LLMConfiguration,
        event_callback: Optional[Callable[[str, Dict], None]] = None,
        qdrant_url: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        pause_check_callback: Optional[Callable[[], bool]] = None,
    ):
        self.config = config
        self.model_client = UnifiedModelClient(config)
        self.event_callback = event_callback
        self.pause_check_callback = pause_check_callback  # Returns True if paused
        self.state: Optional[GenerationState] = None

        # Agent instances
        self.architect: Optional[AssistantAgent] = None
        self.profiler: Optional[AssistantAgent] = None
        self.worldbuilder: Optional[AssistantAgent] = None
        self.strategist: Optional[AssistantAgent] = None
        self.writer: Optional[AssistantAgent] = None
        self.critic: Optional[AssistantAgent] = None
        self.originality: Optional[AssistantAgent] = None
        self.impact: Optional[AssistantAgent] = None
        self.archivist: Optional[AssistantAgent] = None

        # Qdrant memory service (optional)
        self.qdrant_memory: Optional[QdrantMemoryService] = None
        self._qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self._openai_api_key = openai_api_key

        # Initialize agents
        self._initialize_agents()

    async def initialize_memory(
        self,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        prefer_local: bool = False,
    ) -> bool:
        """Initialize Qdrant memory service for character/worldbuilding storage.

        Supports multiple embedding providers with automatic fallback:
        1. OpenAI (if API key provided) - best quality, 1536 dimensions
        2. Gemini (if API key provided) - good quality, 768 dimensions
        3. Local fastembed (no key required) - 384 dimensions

        Args:
            openai_api_key: OpenAI API key for embeddings (highest priority)
            gemini_api_key: Gemini API key for embeddings (second priority)
            prefer_local: If True, use local embeddings even if API keys available

        Returns:
            True if memory was initialized successfully, False otherwise
        """
        openai_key = openai_api_key or self._openai_api_key

        # Try to get Gemini key from config if not provided
        gemini_key = gemini_api_key
        if not gemini_key and self.config.gemini:
            try:
                gemini_key = self.config.gemini.api_key.get_secret_value()
            except Exception:
                pass

        try:
            self.qdrant_memory = QdrantMemoryService(url=self._qdrant_url)
            await self.qdrant_memory.connect(
                openai_api_key=openai_key,
                gemini_api_key=gemini_key,
                prefer_local=prefer_local,
            )

            # Get embedding provider info for the event
            provider_info = {}
            if self.qdrant_memory.embedding_provider:
                info = self.qdrant_memory.embedding_provider.info
                provider_info = {
                    "provider_type": info.provider_type.value,
                    "model_name": info.model_name,
                    "dimension": info.dimension,
                }

            self._emit_event("memory_init", {
                "status": "connected",
                "url": self._qdrant_url,
                **provider_info,
            })
            return True
        except Exception as e:
            self._emit_event("memory_init", {"status": "failed", "error": str(e)})
            self.qdrant_memory = None
            return False

    async def _store_characters_in_memory(self, project_id: str, characters: List[Dict]) -> None:
        """Store generated characters in Qdrant for later retrieval."""
        if not self.qdrant_memory:
            return

        for character in characters:
            try:
                await self.qdrant_memory.store_character(project_id, character)
            except Exception as e:
                self._emit_event("memory_store", {
                    "type": "character",
                    "status": "failed",
                    "character": character.get("name", "unknown"),
                    "error": str(e)
                })

    async def _retrieve_relevant_characters(self, project_id: str, query: str, limit: int = 3) -> List[Dict]:
        """Retrieve relevant characters from memory based on query."""
        if not self.qdrant_memory:
            return []

        try:
            results = await self.qdrant_memory.search_characters(project_id, query, limit=limit)
            return [r["character"] for r in results if r.get("character")]
        except Exception as e:
            self._emit_event("memory_search", {
                "type": "character",
                "status": "failed",
                "error": str(e)
            })
            return []

    async def _store_scene_in_memory(self, project_id: str, scene_number: int, scene: Dict) -> None:
        """Store a drafted scene in Qdrant for continuity."""
        if not self.qdrant_memory:
            return

        try:
            await self.qdrant_memory.store_scene(project_id, scene_number, scene)
        except Exception as e:
            self._emit_event("memory_store", {
                "type": "scene",
                "status": "failed",
                "scene_number": scene_number,
                "error": str(e)
            })

    async def _retrieve_relevant_scenes(self, project_id: str, query: str, limit: int = 2) -> List[Dict]:
        """Retrieve relevant previous scenes for continuity."""
        if not self.qdrant_memory:
            return []

        try:
            results = await self.qdrant_memory.search_scenes(project_id, query, limit=limit)
            return [r["scene"] for r in results if r.get("scene")]
        except Exception as e:
            self._emit_event("memory_search", {
                "type": "scene",
                "status": "failed",
                "error": str(e)
            })
            return []

    async def _store_worldbuilding_in_memory(self, project_id: str, worldbuilding: Dict) -> None:
        """Store worldbuilding elements in Qdrant for retrieval during drafting."""
        if not self.qdrant_memory:
            return

        try:
            # Store geography elements
            for geo in worldbuilding.get("geography", []):
                await self.qdrant_memory.store_worldbuilding(
                    project_id, "geography", geo
                )

            # Store culture elements
            for culture in worldbuilding.get("cultures", []):
                await self.qdrant_memory.store_worldbuilding(
                    project_id, "culture", culture
                )

            # Store rules
            for rule in worldbuilding.get("rules", []):
                await self.qdrant_memory.store_worldbuilding(
                    project_id, "rule", rule
                )

            # Store historical events as a single element
            if worldbuilding.get("historical_events"):
                await self.qdrant_memory.store_worldbuilding(
                    project_id, "history", {
                        "events": worldbuilding["historical_events"],
                        "technology_level": worldbuilding.get("technology_level", ""),
                        "magic_system": worldbuilding.get("magic_system", ""),
                    }
                )

            self._emit_event("memory_store", {
                "type": "worldbuilding",
                "status": "success",
                "geography_count": len(worldbuilding.get("geography", [])),
                "culture_count": len(worldbuilding.get("cultures", [])),
                "rule_count": len(worldbuilding.get("rules", [])),
            })
        except Exception as e:
            self._emit_event("memory_store", {
                "type": "worldbuilding",
                "status": "failed",
                "error": str(e)
            })

    async def _retrieve_worldbuilding(self, project_id: str, query: str, limit: int = 5) -> Dict[str, List[Dict]]:
        """Retrieve relevant worldbuilding elements from memory."""
        if not self.qdrant_memory:
            return {"geography": [], "cultures": [], "rules": [], "history": []}

        try:
            results = await self.qdrant_memory.search_worldbuilding(project_id, query, limit=limit)

            # Organize results by type
            organized = {"geography": [], "cultures": [], "rules": [], "history": []}
            for r in results:
                element_type = r.get("element_type", "")
                element = r.get("element", {})
                if element_type == "geography":
                    organized["geography"].append(element)
                elif element_type == "culture":
                    organized["cultures"].append(element)
                elif element_type == "rule":
                    organized["rules"].append(element)
                elif element_type == "history":
                    organized["history"].append(element)

            return organized
        except Exception as e:
            self._emit_event("memory_search", {
                "type": "worldbuilding",
                "status": "failed",
                "error": str(e)
            })
            return {"geography": [], "cultures": [], "rules": [], "history": []}

    def _get_llm_config(self, agent_name: str) -> Dict[str, Any]:
        """Get LLM configuration for a specific agent."""
        agent_configs = self.config.agent_models

        provider_map = {
            "architect": (agent_configs.architect_provider, agent_configs.architect_model),
            "profiler": (agent_configs.profiler_provider, agent_configs.profiler_model),
            "worldbuilder": (agent_configs.worldbuilder_provider, agent_configs.worldbuilder_model),
            "strategist": (agent_configs.strategist_provider, agent_configs.strategist_model),
            "writer": (agent_configs.writer_provider, agent_configs.writer_model),
            "critic": (agent_configs.critic_provider, agent_configs.critic_model),
            "polish": (agent_configs.polish_provider, agent_configs.polish_model),
            "originality": (agent_configs.critic_provider, agent_configs.critic_model),
            "impact": (agent_configs.critic_provider, agent_configs.critic_model),
            "archivist": (agent_configs.critic_provider, agent_configs.critic_model),
        }

        provider, model = provider_map[agent_name]
        return self.model_client.get_autogen_config(provider, model)

    def _initialize_agents(self) -> None:
        """Initialize all narrative agents with their system prompts."""

        # Enhanced system prompts with communication protocol
        architect_prompt = ARCHITECT_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents using these message types:
- ARTIFACT: When you have completed your work, output your final artifact
- QUESTION: If you need clarification, ask: "QUESTION to [Agent]: [your question]"
- RESPONSE: When answering a question: "RESPONSE to [Agent]: [your answer]"

When the Critic audits your work, respond to their feedback constructively.
Always output your final artifact as valid JSON wrapped in ```json``` blocks.
"""

        profiler_prompt = PROFILER_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your character profiles as final artifact
- QUESTION to Architect: Ask for clarification about the narrative
- RESPONSE: Answer questions from other agents

If something in the narrative is unclear, ASK the Architect before proceeding.
Always output character profiles as a JSON array wrapped in ```json``` blocks.
"""

        worldbuilder_prompt = WORLDBUILDER_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your worldbuilding as final artifact
- QUESTION to Architect: Ask about narrative setting requirements
- QUESTION to Profiler: Ask about character cultural backgrounds
- RESPONSE: Answer questions from other agents

Create rich, sensory worldbuilding that serves the story's themes.
Always output worldbuilding as valid JSON wrapped in ```json``` blocks.
"""

        strategist_prompt = STRATEGIST_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your plot outline as final artifact
- QUESTION to Architect: Ask about narrative direction
- QUESTION to Profiler: Ask about character motivations
- QUESTION to Worldbuilder: Ask about setting details
- OBJECTION: If character profiles don't support the plot, raise: "OBJECTION to Profiler: [issue] SUGGESTED_CHANGE: [suggestion]"
- RESPONSE: Answer questions from other agents

Challenge inconsistencies constructively. Output your outline as valid JSON.
"""

        writer_prompt = WRITER_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your scene draft as final artifact
- QUESTION to Strategist: Ask about scene requirements
- QUESTION to Profiler: Ask about character details
- RESPONSE: Answer questions from the Critic

When the Critic requests revisions, incorporate their feedback thoughtfully.
You have a maximum of 2 revision attempts per scene.
Always output scene drafts as valid JSON wrapped in ```json``` blocks.
"""

        critic_prompt = CRITIC_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your critique as final artifact
- REVISION_REQUEST to Writer: "REVISION_REQUEST: [specific issues] INSTRUCTIONS: [how to fix]"
- APPROVED: When a scene meets quality standards, say "APPROVED" and output your critique
- QUESTION to Writer: Ask for clarification about creative choices

Be constructive but rigorous. A scene needs overall score >= 7.0 to be approved.
Maximum 2 revision rounds per scene - after that, approve with notes.
Always output critiques as valid JSON wrapped in ```json``` blocks.
"""

        polish_prompt = POLISH_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your polished scene as final artifact
- QUESTION to Writer: Ask about stylistic choices
- QUESTION to Critic: Ask about specific feedback points

Focus on sentence-level refinement without changing meaning or voice.
Always output polished scenes as valid JSON wrapped in ```json``` blocks.
"""

        originality_prompt = ORIGINALITY_CHECK_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your originality analysis as final artifact
- QUESTION to Writer: Ask about intentional trope usage
- QUESTION to Critic: Ask about previous feedback on originality

Identify cliches and overused tropes, but consider intentional usage.
Always output originality analysis as valid JSON wrapped in ```json``` blocks.
"""

        impact_prompt = IMPACT_ASSESSMENT_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your impact assessment as final artifact
- QUESTION to Writer: Ask about intended emotional effects
- QUESTION to Critic: Ask about emotional feedback from critique

Evaluate emotional impact against intended beats.
Always output impact assessment as valid JSON wrapped in ```json``` blocks.
"""

        archivist_prompt = ARCHIVIST_SYSTEM_PROMPT + """

## Communication Protocol

You can communicate with other agents:
- ARTIFACT: Output your constraint resolution as final artifact
- QUESTION to Writer: Ask about specific facts from recent scenes
- QUESTION to Critic: Ask about consistency issues noted in critiques

Your role is to maintain narrative consistency by resolving contradictory facts.
Always output constraint resolution as valid JSON wrapped in ```json``` blocks.
"""

        # Create agent instances with enhanced prompts
        # Note: We'll use custom message handling instead of AutoGen's built-in
        self.architect = self._create_agent("Architect", architect_prompt)
        self.profiler = self._create_agent("Profiler", profiler_prompt)
        self.worldbuilder = self._create_agent("Worldbuilder", worldbuilder_prompt)
        self.strategist = self._create_agent("Strategist", strategist_prompt)
        self.writer = self._create_agent("Writer", writer_prompt)
        self.critic = self._create_agent("Critic", critic_prompt)
        self.polish = self._create_agent("Polish", polish_prompt)
        self.originality = self._create_agent("Originality", originality_prompt)
        self.impact = self._create_agent("Impact", impact_prompt)
        self.archivist = self._create_agent("Archivist", archivist_prompt)

    def _create_agent(self, name: str, system_prompt: str) -> Dict[str, Any]:
        """Create an agent configuration (not AutoGen agent directly due to async requirements)."""
        return {
            "name": name,
            "system_prompt": system_prompt,
            "llm_config": self._get_llm_config(name.lower()),
        }

    async def _check_pause(self) -> bool:
        """Check if generation is paused and wait if so.
        
        Returns:
            True if generation should continue, False if cancelled/should stop
        """
        if not self.pause_check_callback:
            return True

        # Check if paused - wait until resumed
        is_paused = self.pause_check_callback()
        if is_paused:
            self._emit_event("pause_wait_start", {
                "message": "Generation paused, waiting for resume...",
            })

        while self.pause_check_callback():
            # Wait a bit before checking again
            await asyncio.sleep(1)

        if is_paused:
            self._emit_event("pause_wait_end", {
                "message": "Generation resumed, continuing...",
            })

        return True

    def _emit_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emit an event to the callback if registered."""
        if self.event_callback:
            self.event_callback(event_type, {
                "project_id": self.state.project_id if self.state else "unknown",
                "timestamp": datetime.utcnow().isoformat(),
                **data,
            })

    def _emit_agent_message(self, agent_name: str, message_type: str, content: str, to_agent: str = None) -> None:
        """Emit an agent message event for chat visualization."""
        self._emit_event("agent_message", {
            "agent": agent_name,
            "message_type": message_type,
            "content": content[:100000] if content else "",  # Large limit to preserve JSON structure for outlines
            "to_agent": to_agent,
        })

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error is retryable (transient network/API errors).
        
        Retryable errors include:
        - Network timeouts and connection errors
        - HTTP 429 (rate limit), 500, 502, 503, 504 (server errors)
        - Provider-specific overload/rate limit exceptions
        
        Non-retryable errors include:
        - HTTP 400 (bad request), 401 (auth), 403 (forbidden)
        - Invalid API key or model errors
        """
        error_str = str(error).lower()
        error_type = type(error).__name__
        
        # Check for retryable HTTP status codes in error message
        retryable_patterns = [
            "429", "rate limit", "rate_limit", "ratelimit",
            "500", "502", "503", "504",
            "timeout", "timed out", "connection",
            "overloaded", "overload", "capacity",
            "temporarily unavailable", "service unavailable",
            "internal server error", "bad gateway", "gateway timeout",
        ]
        
        # Check for non-retryable patterns
        non_retryable_patterns = [
            "401", "403", "400",
            "invalid api key", "invalid_api_key", "authentication",
            "unauthorized", "forbidden", "invalid model",
            "model not found", "does not exist",
        ]
        
        # First check if it's explicitly non-retryable
        for pattern in non_retryable_patterns:
            if pattern in error_str:
                return False
        
        # Then check if it matches retryable patterns
        for pattern in retryable_patterns:
            if pattern in error_str:
                return True
        
        # Check for common exception types
        retryable_types = ["timeout", "connection", "network", "http"]
        for rtype in retryable_types:
            if rtype in error_type.lower():
                return True
        
        return False

    async def _call_agent(
        self,
        agent: Dict[str, Any],
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        max_tokens: Optional[int] = None,
        max_retries: int = 3,
    ) -> str:
        """Call an agent and get its response with automatic retry for transient errors.
        
        Args:
            agent: Agent configuration dict
            user_message: The user message to send
            conversation_history: Optional conversation history
            max_tokens: Maximum tokens for response. If None, uses phase-based dynamic limit.
            max_retries: Maximum number of retry attempts for transient errors (default: 3)
        """
        # Check pause before every agent call for responsive pause behavior
        await self._check_pause()

        messages = [{"role": "system", "content": agent["system_prompt"]}]

        if conversation_history:
            messages.extend(conversation_history)

        messages.append({"role": "user", "content": user_message})

        llm_config = agent["llm_config"]
        provider = self._get_provider_from_config(llm_config)
        model = llm_config.get("model", "")
        
        # Dynamic max_tokens based on current phase (not agent)
        # This allows different models to be used for different tasks
        if max_tokens is None:
            current_phase = self.state.phase if self.state else None
            max_tokens = get_max_tokens_for_phase(current_phase)
        
        # Log without exposing API key
        phase_name = self.state.phase.value if self.state and self.state.phase else "unknown"
        logger.info(f"[_call_agent] Agent: {agent['name']}, Phase: {phase_name}, Provider: {provider}, Model: '{model}', max_tokens: {max_tokens}")
        logger.info(f"[_call_agent] api_key_present: {'api_key' in llm_config and bool(llm_config.get('api_key'))}")

        self._emit_event("agent_start", {
            "agent": agent["name"],
            "phase": self.state.phase.value if self.state else "unknown",
        })

        # Retry loop with exponential backoff
        last_error = None
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    # Exponential backoff: 1s, 3s, 9s (with jitter)
                    import random
                    base_delay = 3 ** attempt  # 1, 3, 9
                    jitter = random.uniform(0, 1)
                    delay = base_delay + jitter
                    logger.info(f"[_call_agent] Retry attempt {attempt + 1}/{max_retries} for {agent['name']} after {delay:.1f}s delay")
                    self._emit_event("agent_retry", {
                        "agent": agent["name"],
                        "attempt": attempt + 1,
                        "max_retries": max_retries,
                        "delay": delay,
                        "error": str(last_error) if last_error else None,
                    })
                    await asyncio.sleep(delay)
                
                response = await self.model_client.create_chat_completion(
                    messages=messages,
                    model=model,
                    provider=provider,
                    temperature=0.7,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"} if "json" in user_message.lower() else None,
                )

                # Log finish_reason to detect truncation
                logger.info(f"[_call_agent] Agent: {agent['name']}, finish_reason: {response.finish_reason}, usage: {response.usage}")
                if response.finish_reason in ("length", "max_tokens"):
                    logger.warning(f"[_call_agent] Agent {agent['name']} response was TRUNCATED (finish_reason={response.finish_reason})")

                self._emit_event("agent_complete", {
                    "agent": agent["name"],
                    "usage": response.usage,
                    "finish_reason": response.finish_reason,
                    "attempts": attempt + 1,
                })

                # Emit the agent's message for chat visualization
                self._emit_agent_message(
                    agent_name=agent["name"],
                    message_type="response",
                    content=response.content,
                )

                return response.content
                
            except Exception as e:
                last_error = e
                logger.warning(f"[_call_agent] Agent {agent['name']} attempt {attempt + 1}/{max_retries} failed: {e}")
                
                # Check if error is retryable
                if not self._is_retryable_error(e):
                    logger.error(f"[_call_agent] Non-retryable error for {agent['name']}: {e}")
                    self._emit_event("agent_failed", {
                        "agent": agent["name"],
                        "error": str(e),
                        "retryable": False,
                        "attempts": attempt + 1,
                    })
                    raise
                
                # If this was the last attempt, raise the error
                if attempt == max_retries - 1:
                    logger.error(f"[_call_agent] All {max_retries} retry attempts exhausted for {agent['name']}")
                    self._emit_event("agent_failed", {
                        "agent": agent["name"],
                        "error": str(e),
                        "retryable": True,
                        "attempts": max_retries,
                    })
                    raise
        
        # This should never be reached, but just in case
        raise last_error if last_error else RuntimeError("Unexpected error in _call_agent")

    def _get_provider_from_config(self, llm_config: Dict[str, Any]) -> LLMProvider:
        """Determine provider from LLM config."""
        if "api_type" in llm_config:
            if llm_config["api_type"] == "anthropic":
                return LLMProvider.CLAUDE
            elif llm_config["api_type"] == "google":
                return LLMProvider.GEMINI

        base_url = llm_config.get("base_url", "")
        if "openrouter" in base_url:
            return LLMProvider.OPENROUTER

        return LLMProvider.OPENAI

    def _extract_json(self, text: str) -> Optional[Dict]:
        """Extract JSON from agent response with robust parsing."""
        if not text or not text.strip():
            logger.warning("[_extract_json] Empty text provided")
            return None

        # Log preview for debugging
        preview = text[:500] + "..." if len(text) > 500 else text
        logger.debug(f"[_extract_json] Attempting to parse text (len={len(text)}): {preview}")

        # Method 1: Try direct JSON parse
        try:
            result = json.loads(text)
            logger.debug("[_extract_json] Direct JSON parse succeeded")
            return result
        except json.JSONDecodeError as e:
            logger.debug(f"[_extract_json] Direct parse failed: {e}")

        # Method 2: Try to extract from markdown code block (```json or ```)
        code_block_patterns = ["```json", "```JSON", "```"]
        for pattern in code_block_patterns:
            if pattern in text:
                try:
                    # Find the content between the code block markers
                    parts = text.split(pattern)
                    if len(parts) >= 2:
                        json_str = parts[1].split("```")[0].strip()
                        result = json.loads(json_str)
                        logger.debug(f"[_extract_json] Code block extraction succeeded with pattern '{pattern}'")
                        return result
                except (IndexError, json.JSONDecodeError) as e:
                    logger.debug(f"[_extract_json] Code block extraction failed for '{pattern}': {e}")

        # Method 3: Use json.JSONDecoder().raw_decode to find JSON starting at first { or [
        for start_char in ["{", "["]:
            start_idx = text.find(start_char)
            if start_idx >= 0:
                try:
                    decoder = json.JSONDecoder()
                    result, _ = decoder.raw_decode(text[start_idx:])
                    logger.debug(f"[_extract_json] raw_decode succeeded starting at '{start_char}' (index {start_idx})")
                    return result
                except json.JSONDecodeError as e:
                    logger.debug(f"[_extract_json] raw_decode failed for '{start_char}': {e}")

        # Method 4: Fallback - try to find balanced braces (for nested JSON)
        try:
            start = text.find("{")
            if start >= 0:
                brace_count = 0
                end = start
                for i, char in enumerate(text[start:], start):
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            end = i + 1
                            break
                if end > start:
                    json_str = text[start:end]
                    result = json.loads(json_str)
                    logger.debug(f"[_extract_json] Balanced brace extraction succeeded")
                    return result
        except json.JSONDecodeError as e:
            logger.debug(f"[_extract_json] Balanced brace extraction failed: {e}")

        # Method 5: Try prepending { if text looks like truncated JSON (starts with "key":)
        # This handles cases where LLM output is truncated and missing the opening brace
        stripped = text.strip()
        if stripped.startswith('"') and '":' in stripped[:50]:
            try:
                # Try wrapping in braces
                wrapped = "{" + stripped
                # Find the last } to close it properly
                if wrapped.count("{") > wrapped.count("}"):
                    wrapped = wrapped + "}"
                result = json.loads(wrapped)
                logger.debug("[_extract_json] Truncated JSON recovery succeeded (prepended {)")
                return result
            except json.JSONDecodeError as e:
                logger.debug(f"[_extract_json] Truncated JSON recovery failed: {e}")

        # Method 6: Try to extract array if text starts with [ but raw_decode failed
        if stripped.startswith("["):
            try:
                # Find matching ]
                bracket_count = 0
                end = 0
                for i, char in enumerate(stripped):
                    if char == "[":
                        bracket_count += 1
                    elif char == "]":
                        bracket_count -= 1
                        if bracket_count == 0:
                            end = i + 1
                            break
                if end > 0:
                    result = json.loads(stripped[:end])
                    logger.debug("[_extract_json] Array extraction succeeded")
                    return result
            except json.JSONDecodeError as e:
                logger.debug(f"[_extract_json] Array extraction failed: {e}")

        logger.warning(f"[_extract_json] All extraction methods failed for text (len={len(text)})")
        return None

    def _parse_agent_message(self, agent_name: str, response: str) -> AgentMessage:
        """Parse agent response into structured message."""
        response_upper = response.upper()

        if "QUESTION TO" in response_upper:
            # Extract target agent and question
            parts = response.split(":", 1)
            if len(parts) > 1:
                target = parts[0].split("to")[-1].strip().rstrip(":")
                content = parts[1].strip()
                return AgentMessage(
                    type="question",
                    from_agent=agent_name,
                    to_agent=target,
                    content=content,
                )

        if "OBJECTION TO" in response_upper:
            parts = response.split("SUGGESTED_CHANGE:", 1)
            issue = parts[0].split(":", 1)[-1].strip() if ":" in parts[0] else parts[0]
            suggestion = parts[1].strip() if len(parts) > 1 else ""
            target = response.split("to")[1].split(":")[0].strip() if "to" in response.lower() else ""
            return AgentMessage(
                type="objection",
                from_agent=agent_name,
                to_agent=target,
                content={"issue": issue, "suggestion": suggestion},
            )

        if "REVISION_REQUEST" in response_upper:
            parts = response.split("INSTRUCTIONS:", 1)
            issues = parts[0].split(":", 1)[-1].strip() if ":" in parts[0] else parts[0]
            instructions = parts[1].strip() if len(parts) > 1 else ""
            return AgentMessage(
                type="revision_request",
                from_agent=agent_name,
                to_agent="Writer",
                content={"issues": issues, "instructions": instructions},
            )

        if "APPROVED" in response_upper:
            json_data = self._extract_json(response)
            return AgentMessage(
                type="approved",
                from_agent=agent_name,
                content=json_data,
            )

        if "RESPONSE TO" in response_upper:
            parts = response.split(":", 1)
            target = parts[0].split("to")[-1].strip().rstrip(":") if "to" in parts[0].lower() else ""
            content = parts[1].strip() if len(parts) > 1 else response
            return AgentMessage(
                type="response",
                from_agent=agent_name,
                to_agent=target,
                content=content,
            )

        # Default: treat as artifact
        json_data = self._extract_json(response)
        return AgentMessage(
            type="artifact",
            from_agent=agent_name,
            content=json_data if json_data else response,
        )

    async def run_genesis_phase(self, project: StoryProject) -> Dict[str, Any]:
        """
        Run the Genesis phase with Architect agent.
        Critic audits the output, Architect can revise.
        """
        self.state = GenerationState(
            phase=GenerationPhase.GENESIS,
            project_id=project.seed_idea[:20].replace(" ", "_"),
        )

        self._emit_event("phase_start", {"phase": "genesis"})

        # Build user prompt for Architect
        user_prompt = f"""
## Project Configuration

**Seed Idea:** {project.seed_idea}

**Moral Compass:** {project.moral_compass.value}

**Target Audience:** {project.target_audience}

**Core Themes:** {", ".join(project.theme_core) if project.theme_core else "Not specified"}

**Style References:** {", ".join(project.tone_style_references) if project.tone_style_references else "Not specified"}

{f"**Custom Moral System:** {project.custom_moral_system}" if project.custom_moral_system else ""}

---

Generate a comprehensive Narrative Possibility as valid JSON following your schema.
"""

        # Architect generates initial narrative
        architect_response = await self._call_agent(self.architect, user_prompt)
        architect_msg = self._parse_agent_message("Architect", architect_response)
        self.state.messages.append(architect_msg)

        # Critic audits the narrative
        critic_prompt = f"""
Review the Architect's narrative possibility for quality and coherence:

{json.dumps(architect_msg.content, indent=2) if isinstance(architect_msg.content, dict) else architect_msg.content}

Provide feedback on:
1. Does the narrative have sufficient depth for character development?
2. Is the conflict compelling and clear?
3. Does it align with the {project.moral_compass.value} moral compass?
4. Are there any logical inconsistencies?

If issues are found, provide specific feedback. Otherwise, approve the narrative.
Output your assessment as JSON with fields: approved (bool), feedback (str), suggestions (list).
"""

        critic_response = await self._call_agent(self.critic, critic_prompt)
        critic_msg = self._parse_agent_message("Critic", critic_response)
        self.state.messages.append(critic_msg)

        # If Critic has feedback, let Architect revise
        if isinstance(critic_msg.content, dict) and not critic_msg.content.get("approved", True):
            revision_prompt = f"""
The Critic has provided feedback on your narrative:

{json.dumps(critic_msg.content, indent=2)}

Please revise your Narrative Possibility to address these concerns.
Output the revised narrative as valid JSON.
"""
            revised_response = await self._call_agent(
                self.architect,
                revision_prompt,
                [{"role": "assistant", "content": architect_response}],
            )
            architect_msg = self._parse_agent_message("Architect", revised_response)
            self.state.messages.append(architect_msg)

        self.state.narrative = architect_msg.content if isinstance(architect_msg.content, dict) else None

        self._emit_event("phase_complete", {
            "phase": "genesis",
            "result": self.state.narrative,
        })

        return {
            "narrative_possibility": self.state.narrative,
            "messages": [
                {"agent": m.from_agent, "type": m.type, "content": str(m.content)[:500]}
                for m in self.state.messages
            ],
        }

    async def run_narrative_possibilities(
        self, project: StoryProject
    ) -> Dict[str, Any]:
        """
        Generate multiple narrative possibilities (3-5) for user selection.

        This implements the Narrative Possibilities Branching feature from
        Storyteller Framework Section 1.4. Instead of generating a single
        narrative direction, this generates multiple distinct possibilities
        for the user to choose from.

        Args:
            project: The StoryProject with seed idea and configuration

        Returns:
            Dict containing:
            - narrative_possibilities: List of 3-5 narrative options
            - recommendation: Architect's recommended choice
            - messages: Agent communication log
        """
        self.state = GenerationState(
            phase=GenerationPhase.GENESIS,
            project_id=project.seed_idea[:20].replace(" ", "_"),
        )

        self._emit_event("phase_start", {"phase": "narrative_possibilities"})

        # Build custom moral system section if provided
        custom_moral_section = ""
        if project.custom_moral_system:
            custom_moral_section = f"\n- Custom Moral System: {project.custom_moral_system}"

        # Format the prompt with project configuration
        formatted_prompt = NARRATIVE_POSSIBILITIES_PROMPT.format(
            seed_idea=project.seed_idea,
            moral_compass=project.moral_compass.value,
            target_audience=project.target_audience,
            theme_core=", ".join(project.theme_core) if project.theme_core else "Not specified",
            tone_style_references=", ".join(project.tone_style_references) if project.tone_style_references else "Not specified",
            custom_moral_system_section=custom_moral_section,
        )

        # Architect generates multiple narrative possibilities
        architect_response = await self._call_agent(self.architect, formatted_prompt)
        architect_msg = self._parse_agent_message("Architect", architect_response)
        self.state.messages.append(architect_msg)

        # Extract the narrative possibilities from the response
        possibilities_data = architect_msg.content if isinstance(architect_msg.content, dict) else {}
        narrative_possibilities = possibilities_data.get("narrative_possibilities", [])
        recommendation = possibilities_data.get("recommendation", {})

        # Emit event with all possibilities for frontend to display
        self._emit_event("narrative_possibilities_generated", {
            "count": len(narrative_possibilities),
            "possibilities": narrative_possibilities,
            "recommendation": recommendation,
        })

        self._emit_event("phase_complete", {
            "phase": "narrative_possibilities",
            "count": len(narrative_possibilities),
        })

        return {
            "narrative_possibilities": narrative_possibilities,
            "recommendation": recommendation,
            "messages": [
                {"agent": m.from_agent, "type": m.type, "content": str(m.content)[:500]}
                for m in self.state.messages
            ],
        }

    async def run_genesis_with_selection(
        self,
        project: StoryProject,
        selected_possibility: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Run Genesis phase with a pre-selected narrative possibility.

        This is called after the user has selected one of the narrative
        possibilities generated by run_narrative_possibilities.

        Args:
            project: The StoryProject with seed idea and configuration
            selected_possibility: The user's chosen narrative possibility

        Returns:
            Dict containing the selected narrative as the genesis result
        """
        self.state = GenerationState(
            phase=GenerationPhase.GENESIS,
            project_id=project.seed_idea[:20].replace(" ", "_"),
        )

        self._emit_event("phase_start", {"phase": "genesis"})

        # Convert selected possibility to standard narrative format
        # The selected possibility already has the required fields
        narrative = {
            "plot_summary": selected_possibility.get("plot_summary", ""),
            "setting_description": selected_possibility.get("setting_description", ""),
            "main_conflict": selected_possibility.get("main_conflict", ""),
            "potential_characters": selected_possibility.get("potential_characters", []),
            "possible_twists": selected_possibility.get("possible_twists", []),
            "thematic_elements": selected_possibility.get("thematic_elements", []),
            "moral_compass_application": selected_possibility.get("moral_compass_application", ""),
            # Additional fields from branching
            "title": selected_possibility.get("title", ""),
            "genre_approach": selected_possibility.get("genre_approach", ""),
            "conflict_type": selected_possibility.get("conflict_type", ""),
            "unique_appeal": selected_possibility.get("unique_appeal", ""),
            "estimated_tone": selected_possibility.get("estimated_tone", ""),
        }

        self.state.narrative = narrative

        # Create a synthetic agent message for the log
        self.state.messages.append(AgentMessage(
            type="artifact",
            from_agent="Architect",
            content=narrative,
        ))

        self._emit_event("phase_complete", {
            "phase": "genesis",
            "result": narrative,
            "selected_from_possibilities": True,
        })

        return {
            "narrative_possibility": narrative,
            "messages": [
                {"agent": m.from_agent, "type": m.type, "content": str(m.content)[:500]}
                for m in self.state.messages
            ],
        }

    async def run_characters_phase(
        self,
        narrative: Dict[str, Any],
        moral_compass: str,
        target_audience: str,
        change_request: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run the Characters phase with Profiler agent.
        Profiler can ask Architect questions about the narrative.
        """
        self.state.phase = GenerationPhase.CHARACTERS
        self._emit_event("phase_start", {"phase": "characters"})

        # Build change request section if provided
        change_request_section = ""
        if change_request:
            change_request_section = f"""
---

## IMPORTANT: User Change Request (MUST SATISFY)

The user has requested the following changes that you MUST incorporate:

> {change_request}

Make sure your output reflects these requirements.

---
"""

        user_prompt = f"""
## Narrative Context

**Plot Summary:** {narrative.get("plot_summary", "")}

**Setting:** {narrative.get("setting_description", "")}

**Main Conflict:** {narrative.get("main_conflict", "")}

**Moral Compass:** {moral_compass}

**Target Audience:** {target_audience}

**Thematic Elements:** {_safe_join(narrative.get("thematic_elements", []))}

**Required Character Types:** {_safe_join(narrative.get("potential_characters", []))}
{change_request_section}
---

Create detailed psychological profiles for each required character.
If you need clarification about the narrative, ask: "QUESTION to Architect: [your question]"
Otherwise, output character profiles as a JSON array.
"""

        profiler_response = await self._call_agent(self.profiler, user_prompt)
        profiler_msg = self._parse_agent_message("Profiler", profiler_response)
        self.state.messages.append(profiler_msg)

        # Handle questions to Architect
        if profiler_msg.type == "question":
            architect_response = await self._call_agent(
                self.architect,
                f"The Profiler asks: {profiler_msg.content}\n\nProvide a helpful response.",
            )
            self.state.messages.append(AgentMessage(
                type="response",
                from_agent="Architect",
                to_agent="Profiler",
                content=architect_response,
            ))

            # Profiler continues with the answer
            followup_prompt = f"""
The Architect responds: {architect_response}

Now create the character profiles as a JSON array.
"""
            profiler_response = await self._call_agent(
                self.profiler,
                followup_prompt,
                [{"role": "assistant", "content": profiler_response}],
            )
            profiler_msg = self._parse_agent_message("Profiler", profiler_response)
            self.state.messages.append(profiler_msg)

        # Parse characters
        if isinstance(profiler_msg.content, dict):
            if "characters" in profiler_msg.content:
                self.state.characters = profiler_msg.content["characters"]
            else:
                self.state.characters = [profiler_msg.content]
        elif isinstance(profiler_msg.content, list):
            self.state.characters = profiler_msg.content

        self._emit_event("phase_complete", {
            "phase": "characters",
            "character_count": len(self.state.characters),
        })

        return {
            "characters": self.state.characters,
            "messages": [
                {"agent": m.from_agent, "type": m.type}
                for m in self.state.messages if m.type in ["question", "response"]
            ],
        }

    async def run_worldbuilding_phase(
        self,
        narrative: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        target_audience: str,
        change_request: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run the Worldbuilding phase with Worldbuilder agent.
        Creates rich, consistent world details for the story.
        """
        self.state.phase = GenerationPhase.WORLDBUILDING
        self._emit_event("phase_start", {"phase": "worldbuilding"})

        # Format character summaries for worldbuilding context
        characters_summary = "\n\n".join([
            f"**{c.get('name', 'Unknown')}** ({c.get('archetype', 'Unknown')})\n"
            f"- Background: {c.get('background', 'Unknown')}\n"
            f"- Core Motivation: {c.get('core_motivation', 'Unknown')}"
            for c in characters
        ])

        # Import the user prompt template
        from prompts.worldbuilder import WORLDBUILDER_USER_PROMPT_TEMPLATE

        user_prompt = WORLDBUILDER_USER_PROMPT_TEMPLATE.format(
            plot_summary=narrative.get("plot_summary", ""),
            setting_description=narrative.get("setting_description", ""),
            main_conflict=narrative.get("main_conflict", ""),
            moral_compass=moral_compass,
            target_audience=target_audience,
            thematic_elements=_safe_join(narrative.get("thematic_elements", [])),
            characters_summary=characters_summary,
        )

        # Add change request section if provided
        if change_request:
            user_prompt += f"""

---

## IMPORTANT: User Change Request (MUST SATISFY)

The user has requested the following changes that you MUST incorporate:

> {change_request}

Make sure your output reflects these requirements.
"""

        worldbuilder_response = await self._call_agent(self.worldbuilder, user_prompt)
        worldbuilder_msg = self._parse_agent_message("Worldbuilder", worldbuilder_response)
        self.state.messages.append(worldbuilder_msg)

        # Handle questions to Architect or Profiler
        if worldbuilder_msg.type == "question":
            target_agent = worldbuilder_msg.to_agent or "Architect"
            if target_agent == "Profiler":
                response = await self._call_agent(
                    self.profiler,
                    f"The Worldbuilder asks: {worldbuilder_msg.content}\n\nProvide a helpful response about character backgrounds.",
                )
            else:
                response = await self._call_agent(
                    self.architect,
                    f"The Worldbuilder asks: {worldbuilder_msg.content}\n\nProvide a helpful response about the narrative setting.",
                )
            self.state.messages.append(AgentMessage(
                type="response",
                from_agent=target_agent,
                to_agent="Worldbuilder",
                content=response,
            ))

            # Worldbuilder continues with the answer
            followup_prompt = f"""
The {target_agent} responds: {response}

Now create the worldbuilding as valid JSON following the specified schema.
"""
            worldbuilder_response = await self._call_agent(
                self.worldbuilder,
                followup_prompt,
                [{"role": "assistant", "content": worldbuilder_response}],
            )
            worldbuilder_msg = self._parse_agent_message("Worldbuilder", worldbuilder_response)
            self.state.messages.append(worldbuilder_msg)

        # Parse worldbuilding
        worldbuilding = {}
        if isinstance(worldbuilder_msg.content, dict):
            worldbuilding = worldbuilder_msg.content

        # Store worldbuilding in state
        self.state.worldbuilding = worldbuilding

        # Store in Qdrant memory if available
        if self.qdrant_memory and self.state.project_id:
            await self._store_worldbuilding_in_memory(self.state.project_id, worldbuilding)

        self._emit_event("phase_complete", {
            "phase": "worldbuilding",
            "geography_count": len(worldbuilding.get("geography", [])),
            "culture_count": len(worldbuilding.get("cultures", [])),
            "rule_count": len(worldbuilding.get("rules", [])),
        })

        return {
            "worldbuilding": worldbuilding,
            "messages": [
                {"agent": m.from_agent, "type": m.type}
                for m in self.state.messages if m.type in ["question", "response"]
            ],
        }

    async def run_outlining_phase(
        self,
        narrative: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        target_word_count: int = 50000,
        estimated_scenes: int = 20,
        preferred_structure: str = "ThreeAct",
        worldbuilding: Optional[Dict[str, Any]] = None,
        change_request: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run the Outlining phase with Strategist agent.
        Strategist can challenge Profiler on character consistency.
        """
        self.state.phase = GenerationPhase.OUTLINING
        self._emit_event("phase_start", {"phase": "outlining"})

        # Format character profiles
        character_profiles_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}** ({c.get('archetype', 'Unknown')})\n"
            f"- Core Motivation: {c.get('core_motivation', 'Unknown')}\n"
            f"- Inner Trap: {c.get('inner_trap', 'Unknown')}\n"
            f"- Psychological Wound: {c.get('psychological_wound', 'Unknown')}\n"
            f"- Potential Arc: {c.get('potential_arc', 'Unknown')}"
            for c in characters
        ])

        # Format worldbuilding context if available
        worldbuilding_str = ""
        if worldbuilding:
            locations = worldbuilding.get("geography", [])
            cultures = worldbuilding.get("cultures", [])
            rules = worldbuilding.get("rules", [])

            if locations:
                worldbuilding_str += "\n### Key Locations\n"
                for loc in locations:
                    worldbuilding_str += f"- **{loc.get('location_name', 'Unknown')}**: {loc.get('description', '')[:200]}\n"

            if cultures:
                worldbuilding_str += "\n### Cultures\n"
                for culture in cultures:
                    worldbuilding_str += f"- **{culture.get('culture_name', 'Unknown')}**: Values: {', '.join(culture.get('values', []))}\n"

            if rules:
                worldbuilding_str += "\n### World Rules\n"
                for rule in rules:
                    worldbuilding_str += f"- **{rule.get('rule_name', 'Unknown')}**: {rule.get('description', '')[:150]}\n"

        user_prompt = f"""
## Narrative Foundation

**Plot Summary:** {narrative.get("plot_summary", "")}

**Setting:** {narrative.get("setting_description", "")}

**Main Conflict:** {narrative.get("main_conflict", "")}

**Moral Compass:** {moral_compass}

**Thematic Elements:** {_safe_join(narrative.get("thematic_elements", []))}

## Character Profiles

{character_profiles_str}

## Worldbuilding Context
{worldbuilding_str if worldbuilding_str else "No detailed worldbuilding available - use setting description above."}

## Requirements

**Target Word Count:** {target_word_count} words total
**Estimated Scene Count:** {estimated_scenes} scenes
**Preferred Structure:** {preferred_structure}

---

Create a detailed scene-by-scene outline that leverages the worldbuilding elements.
Each scene should specify which locations and cultural elements are relevant.
If character profiles don't support the plot, raise: "OBJECTION to Profiler: [issue] SUGGESTED_CHANGE: [suggestion]"
Otherwise, output the outline as valid JSON.
"""

        # Add change request section if provided
        if change_request:
            user_prompt += f"""

---

## IMPORTANT: User Change Request (MUST SATISFY)

The user has requested the following changes that you MUST incorporate:

> {change_request}

Make sure your output reflects these requirements.
"""

        strategist_response = await self._call_agent(self.strategist, user_prompt)
        strategist_msg = self._parse_agent_message("Strategist", strategist_response)
        self.state.messages.append(strategist_msg)

        # Handle objections to Profiler
        if strategist_msg.type == "objection":
            self._emit_event("agent_objection", {
                "from": "Strategist",
                "to": "Profiler",
                "issue": strategist_msg.content.get("issue", ""),
            })

            # Profiler responds to objection
            profiler_response = await self._call_agent(
                self.profiler,
                f"""
The Strategist raises an objection about the character profiles:

Issue: {strategist_msg.content.get("issue", "")}
Suggested Change: {strategist_msg.content.get("suggestion", "")}

Please address this concern and provide updated character information if needed.
""",
            )
            self.state.messages.append(AgentMessage(
                type="response",
                from_agent="Profiler",
                to_agent="Strategist",
                content=profiler_response,
            ))

            # Strategist continues with the response
            followup_prompt = f"""
The Profiler responds: {profiler_response}

Now create the plot outline as valid JSON.
"""
            strategist_response = await self._call_agent(
                self.strategist,
                followup_prompt,
                [{"role": "assistant", "content": strategist_response}],
            )
            strategist_msg = self._parse_agent_message("Strategist", strategist_response)
            self.state.messages.append(strategist_msg)

        self.state.outline = strategist_msg.content if isinstance(strategist_msg.content, dict) else None

        # Recovery path: if parsing failed, retry with explicit JSON-only instruction
        if self.state.outline is None:
            logger.warning(f"[run_outlining_phase] Initial parsing failed. Content type: {type(strategist_msg.content).__name__}")
            if isinstance(strategist_msg.content, str):
                logger.warning(f"[run_outlining_phase] Content preview (first 500 chars): {strategist_msg.content[:500]}")

            # Retry with explicit JSON-only instruction
            retry_prompt = f"""Your previous response could not be parsed as valid JSON.

Please provide ONLY the outline as a valid JSON object with NO markdown formatting, NO code fences, NO explanatory text.

The JSON must have this structure:
{{
  "scenes": [
    {{
      "scene_number": 1,
      "title": "Scene Title",
      "location": "Location name",
      "characters": ["Character1", "Character2"],
      "conflict": "The main conflict in this scene",
      "emotional_beat": "The emotional tone/beat",
      "purpose": "What this scene accomplishes",
      "word_count_target": 2500
    }}
  ],
  "act_structure": {{
    "act_1": [1, 2, 3],
    "act_2": [4, 5, 6, 7, 8],
    "act_3": [9, 10]
  }}
}}

Output ONLY the JSON, starting with {{ and ending with }}. No other text."""

            logger.info("[run_outlining_phase] Attempting recovery with JSON-only prompt")
            retry_response = await self._call_agent(
                self.strategist,
                retry_prompt,
                [{"role": "assistant", "content": strategist_response}],
            )
            retry_msg = self._parse_agent_message("Strategist", retry_response)
            self.state.messages.append(retry_msg)

            if isinstance(retry_msg.content, dict):
                logger.info("[run_outlining_phase] Recovery succeeded - got valid JSON")
                self.state.outline = retry_msg.content
            else:
                logger.error(f"[run_outlining_phase] Recovery failed. Content type: {type(retry_msg.content).__name__}")
                if isinstance(retry_msg.content, str):
                    logger.error(f"[run_outlining_phase] Recovery content preview: {retry_msg.content[:500]}")

        self._emit_event("phase_complete", {
            "phase": "outlining",
            "scene_count": len(self.state.outline.get("scenes", [])) if self.state.outline else 0,
        })

        return {
            "outline": self.state.outline,
            "messages": [
                {"agent": m.from_agent, "type": m.type}
                for m in self.state.messages if m.type in ["objection", "response"]
            ],
        }

    async def run_drafting_phase(
        self,
        scene: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        worldbuilding: Optional[Dict] = None,
        previous_scene_summary: str = "N/A",
        memory_context: Optional[Dict[str, Any]] = None,
        narrator_config: Optional[Dict[str, Any]] = None,
        narrator_design: Optional[Dict[str, Any]] = None,
        change_request: Optional[str] = None,
        sensory_blueprint: Optional[Dict[str, Any]] = None,
        subtext_design: Optional[Dict[str, Any]] = None,
        motif_target: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run the Drafting phase with Writer↔Critic loop.
        Maximum 2 revisions per scene.

        Args:
            scene: Scene outline with title, conflict, emotional beat, etc.
            characters: List of character profiles
            moral_compass: Moral compass setting for the story
            worldbuilding: Optional worldbuilding context
            previous_scene_summary: Summary of the previous scene for continuity
            memory_context: Optional context from Qdrant memory with:
                - relevant_characters: Characters retrieved by semantic search
                - relevant_scenes: Previous scenes retrieved for continuity
            narrator_config: Optional basic narrator settings (POV, reliability, stance)
            narrator_design: Optional comprehensive narrator design artifact with:
                - pov: Point of view details with rationale
                - reliability: Reliability level and unreliability details
                - stance: Emotional stance and moral position
                - voice_characteristics: Vocabulary, sentence structure, verbal tics
                - narrative_techniques: Tense, direct address, time handling
                - character_relationship: Protagonist distance, interiority access
                - sample_voice: Example of the narrator's voice
            sensory_blueprint: Optional pre-planned sensory details for the scene
            subtext_design: Optional pre-designed subtext layer for the scene
            motif_target: Optional per-scene motif target from the motif bible with:
                - primary_motif: Main motif to feature in this scene
                - secondary_motifs: Supporting motifs to weave in
                - visual_focus: Key visual to emphasize
                - color_emphasis: Dominant color if any
                - symbol_placement: Where/how symbols should appear
        """
        self.state.phase = GenerationPhase.DRAFTING
        scene_number = scene.get("scene_number", 1)
        self.state.current_scene = scene_number
        self.state.revision_count[scene_number] = 0

        logger.info(f"[run_drafting_phase] Starting drafting for scene {scene_number}: {scene.get('title', 'untitled')}")
        
        self._emit_event("phase_start", {
            "phase": "drafting",
            "scene_number": scene_number,
        })

        # Format character profiles for present characters
        present_characters = [
            c for c in characters
            if c.get("name") in scene.get("characters_present", [])
        ]
        character_profiles_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}**\n"
            f"- Visual Signature: {c.get('visual_signature', 'Unknown')}\n"
            f"- Quirks: {', '.join(c.get('quirks', []))}\n"
            f"- Coping Mechanism: {c.get('coping_mechanism', 'Unknown')}"
            for c in present_characters
        ])

        emotional_beat = _normalize_dict(scene.get("emotional_beat"), fallback_key="initial_state")

        # Format memory context if available
        memory_context_str = ""
        if memory_context:
            relevant_chars = memory_context.get("relevant_characters", [])
            relevant_scenes = memory_context.get("relevant_scenes", [])

            if relevant_chars:
                memory_context_str += "\n## Retrieved Character Context (from memory)\n\n"
                memory_context_str += "These characters are semantically relevant to this scene. Use this context to maintain consistency:\n\n"
                for char in relevant_chars:
                    char_name = char.get('name', 'Unknown')
                    memory_context_str += f"**{char_name}**\n"
                    if char.get('core_motivation'):
                        memory_context_str += f"- Core Motivation: {char.get('core_motivation')}\n"
                    if char.get('inner_trap'):
                        memory_context_str += f"- Inner Trap: {char.get('inner_trap')}\n"
                    if char.get('psychological_wound'):
                        memory_context_str += f"- Psychological Wound: {char.get('psychological_wound')}\n"
                    if char.get('visual_signature'):
                        memory_context_str += f"- Visual Signature: {char.get('visual_signature')}\n"
                    if char.get('quirks'):
                        quirks = char.get('quirks', [])
                        if isinstance(quirks, list) and quirks:
                            memory_context_str += f"- Quirks: {', '.join(quirks)}\n"
                    if char.get('coping_mechanism'):
                        memory_context_str += f"- Coping Mechanism: {char.get('coping_mechanism')}\n"
                    memory_context_str += "\n"

            if relevant_scenes:
                memory_context_str += "\n## Related Previous Scenes (from memory)\n\n"
                memory_context_str += "These scenes are semantically related. Use them for continuity and consistency:\n\n"
                for scene_mem in relevant_scenes:
                    scene_title = scene_mem.get('title', 'Scene')
                    memory_context_str += f"**{scene_title}**\n"
                    if scene_mem.get('setting_description'):
                        memory_context_str += f"- Setting: {scene_mem.get('setting_description')[:150]}...\n"
                    if scene_mem.get('emotional_shift'):
                        memory_context_str += f"- Emotional Shift: {scene_mem.get('emotional_shift')}\n"
                    if scene_mem.get('narrative_content'):
                        memory_context_str += f"- Content Preview: {scene_mem.get('narrative_content', '')[:300]}...\n"
                    memory_context_str += "\n"

        # Format key constraints context (immutable facts from Archivist)
        # These are canonical truths that MUST be preserved across revisions
        # Use relevance filtering based on characters present and recency
        characters_present_names = scene.get("characters_present", [])
        constraints_context_str = ""
        constraints_context = self.get_current_constraints_context(
            current_scene=scene_number,
            characters_present=characters_present_names,
        )
        if constraints_context and constraints_context != "No constraints established yet.":
            constraints_context_str = """
## Key Constraints (IMMUTABLE - DO NOT CONTRADICT)

These are canonical facts established in previous scenes. You MUST preserve these truths in your writing. Do not contradict or ignore them.

"""
            constraints_context_str += constraints_context + "\n"

        # Format narrator design for the prompt (prefer comprehensive narrator_design over basic narrator_config)
        narrator_str = ""
        if narrator_design:
            # Use comprehensive narrator design artifact
            pov = narrator_design.get("pov", {})
            reliability = narrator_design.get("reliability", {})
            stance = narrator_design.get("stance", {})
            voice = narrator_design.get("voice_characteristics", {})
            techniques = narrator_design.get("narrative_techniques", {})
            char_rel = narrator_design.get("character_relationship", {})
            sample_voice = narrator_design.get("sample_voice", "")

            narrator_str = """
## Narrator Design (Comprehensive)

"""
            # POV section
            pov_type = pov.get("type", "third_person_limited")
            pov_focal = pov.get("focal_character", "")
            pov_rationale = pov.get("rationale", "")
            narrator_str += f"**Point of View:** {pov_type}\n"
            if pov_focal:
                narrator_str += f"- Focal Character: {pov_focal}\n"
            if pov_rationale:
                narrator_str += f"- Rationale: {pov_rationale}\n"
            narrator_str += "\n"

            # Reliability section
            rel_level = reliability.get("level", "reliable")
            narrator_str += f"**Narrator Reliability:** {rel_level}\n"
            if rel_level == "unreliable" and reliability.get("if_unreliable"):
                unreliable_info = reliability["if_unreliable"]
                narrator_str += f"- Type: {unreliable_info.get('type', 'N/A')}\n"
                blind_spots = unreliable_info.get("blind_spots", [])
                if blind_spots:
                    narrator_str += f"- Blind Spots: {', '.join(blind_spots) if isinstance(blind_spots, list) else blind_spots}\n"
                hidden_truths = unreliable_info.get("hidden_truths", [])
                if hidden_truths:
                    narrator_str += f"- Hidden Truths: {', '.join(hidden_truths) if isinstance(hidden_truths, list) else hidden_truths}\n"
            narrator_str += "\n"

            # Stance section
            stance_primary = stance.get("primary", "objective")
            narrator_str += f"**Emotional Stance:** {stance_primary}\n"
            if stance.get("emotional_investment"):
                narrator_str += f"- Emotional Investment: {stance['emotional_investment']}\n"
            if stance.get("moral_position"):
                narrator_str += f"- Moral Position: {stance['moral_position']}\n"
            narrator_str += "\n"

            # Voice Characteristics section (CRITICAL for distinctive voice)
            if voice:
                narrator_str += "**Voice Characteristics:**\n"
                vocab = voice.get("vocabulary", {})
                if vocab:
                    narrator_str += f"- Vocabulary Level: {vocab.get('level', 'moderate')}, Style: {vocab.get('style', 'N/A')}\n"
                    distinctive_words = vocab.get("distinctive_words", [])
                    if distinctive_words:
                        narrator_str += f"- Distinctive Words/Phrases: {', '.join(distinctive_words) if isinstance(distinctive_words, list) else distinctive_words}\n"

                sentence = voice.get("sentence_structure", {})
                if sentence:
                    narrator_str += f"- Sentence Rhythm: {sentence.get('rhythm', 'N/A')}\n"
                    narrator_str += f"- Average Length: {sentence.get('average_length', 'varied')}\n"
                    patterns = sentence.get("signature_patterns", [])
                    if patterns:
                        narrator_str += f"- Signature Patterns: {', '.join(patterns) if isinstance(patterns, list) else patterns}\n"

                verbal_tics = voice.get("verbal_tics", [])
                if verbal_tics:
                    narrator_str += f"- Verbal Tics: {', '.join(verbal_tics) if isinstance(verbal_tics, list) else verbal_tics}\n"

                cultural = voice.get("cultural_markers", [])
                if cultural:
                    narrator_str += f"- Cultural Markers: {', '.join(cultural) if isinstance(cultural, list) else cultural}\n"

                if voice.get("emotional_temperature"):
                    narrator_str += f"- Emotional Temperature: {voice['emotional_temperature']}\n"
                narrator_str += "\n"

            # Narrative Techniques section
            if techniques:
                narrator_str += "**Narrative Techniques:**\n"
                if techniques.get("tense"):
                    narrator_str += f"- Tense: {techniques['tense']}\n"
                if techniques.get("direct_address"):
                    narrator_str += f"- Direct Address: {techniques['direct_address']}\n"
                if techniques.get("time_handling"):
                    narrator_str += f"- Time Handling: {techniques['time_handling']}\n"
                if techniques.get("interior_monologue"):
                    narrator_str += f"- Interior Monologue: {techniques['interior_monologue']}\n"
                if techniques.get("dialogue_style"):
                    narrator_str += f"- Dialogue Style: {techniques['dialogue_style']}\n"
                narrator_str += "\n"

            # Character Relationship section
            if char_rel:
                narrator_str += "**Narrator-Character Relationship:**\n"
                if char_rel.get("protagonist_distance"):
                    narrator_str += f"- Distance from Protagonist: {char_rel['protagonist_distance']}\n"
                if char_rel.get("interiority_access"):
                    narrator_str += f"- Interiority Access: {char_rel['interiority_access']}\n"
                if char_rel.get("revelation_style"):
                    narrator_str += f"- Revelation Style: {char_rel['revelation_style']}\n"
                narrator_str += "\n"

            # Sample Voice (for reference)
            if sample_voice:
                narrator_str += f"**Sample Voice (for reference):**\n\"{sample_voice}\"\n\n"

            narrator_str += """IMPORTANT: Write the entire scene strictly adhering to this narrator design. Maintain the distinctive voice characteristics throughout. The POV determines whose thoughts we can access. The voice characteristics define HOW the narrator speaks - vocabulary, rhythm, verbal tics. This is what makes your narrator unique and memorable.
"""
        elif narrator_config:
            # Fallback to basic narrator config if no comprehensive design available
            pov_map = {
                "first_person": "First Person (I/We) - intimate, limited to narrator's knowledge",
                "third_person_limited": "Third Person Limited (He/She) - follows one character's perspective",
                "third_person_omniscient": "Third Person Omniscient - all-knowing narrator with access to all characters' thoughts",
                "second_person": "Second Person (You) - immersive, experimental, reader as protagonist",
            }
            reliability_map = {
                "reliable": "Reliable - trustworthy narrator who presents events accurately",
                "unreliable": "Unreliable - biased or deceptive narrator, reader must question the narrative",
            }
            stance_map = {
                "objective": "Objective - reports events without judgment or commentary",
                "judgmental": "Judgmental - comments on and evaluates characters and events",
                "sympathetic": "Sympathetic - empathizes with characters, emotionally engaged",
            }
            narrator_str = f"""
## Narrator Design

**Point of View:** {pov_map.get(narrator_config.get('pov', 'third_person_limited'), 'Third Person Limited')}
**Narrator Reliability:** {reliability_map.get(narrator_config.get('reliability', 'reliable'), 'Reliable')}
**Narrator Stance:** {stance_map.get(narrator_config.get('stance', 'objective'), 'Objective')}

IMPORTANT: Write the entire scene strictly adhering to these narrator settings. The POV determines whose thoughts we can access and how pronouns are used. The reliability affects how events are presented. The stance affects the narrative voice and tone.
"""

        # Format sensory blueprint if available
        sensory_str = ""
        if sensory_blueprint:
            sensory_str = """
## Sensory Blueprint (Pre-Planned Sensory Details)

IMPORTANT: Use these pre-planned sensory details to enrich your scene. These have been specifically designed for this scene's emotional journey.

"""
            if sensory_blueprint.get("visual_palette"):
                visual = sensory_blueprint["visual_palette"]
                sensory_str += "**Visual Palette:**\n"
                sensory_str += f"- Dominant Colors: {visual.get('dominant_colors', 'N/A')}\n"
                sensory_str += f"- Lighting: {visual.get('lighting', 'N/A')}\n"
                sensory_str += f"- Key Visual Elements: {visual.get('key_elements', 'N/A')}\n\n"

            if sensory_blueprint.get("soundscape"):
                sound = sensory_blueprint["soundscape"]
                sensory_str += "**Soundscape:**\n"
                sensory_str += f"- Ambient Sounds: {sound.get('ambient', 'N/A')}\n"
                sensory_str += f"- Character Sounds: {sound.get('character_sounds', 'N/A')}\n"
                sensory_str += f"- Silence Moments: {sound.get('silence_moments', 'N/A')}\n\n"

            if sensory_blueprint.get("tactile_elements"):
                tactile = sensory_blueprint["tactile_elements"]
                sensory_str += "**Tactile Elements:**\n"
                sensory_str += f"- Textures: {tactile.get('textures', 'N/A')}\n"
                sensory_str += f"- Temperature: {tactile.get('temperature', 'N/A')}\n"
                sensory_str += f"- Physical Sensations: {tactile.get('physical_sensations', 'N/A')}\n\n"

            if sensory_blueprint.get("olfactory_gustatory"):
                smell_taste = sensory_blueprint["olfactory_gustatory"]
                sensory_str += "**Smell & Taste:**\n"
                sensory_str += f"- Scents: {smell_taste.get('scents', 'N/A')}\n"
                sensory_str += f"- Tastes: {smell_taste.get('tastes', 'N/A')}\n\n"

            if sensory_blueprint.get("internal_sensations"):
                internal = sensory_blueprint["internal_sensations"]
                sensory_str += "**Internal Sensations (Character POV):**\n"
                sensory_str += f"- Physical: {internal.get('physical', 'N/A')}\n"
                sensory_str += f"- Emotional: {internal.get('emotional', 'N/A')}\n\n"

        # Format subtext design if available
        subtext_str = ""
        if subtext_design:
            subtext_str = """
## Subtext Design (Iceberg Principle - 60% Implicit)

IMPORTANT: Use these pre-designed subtext layers. Remember: show, don't tell. Most meaning should remain beneath the surface.

"""
            if subtext_design.get("iceberg_ratio"):
                ratio = subtext_design["iceberg_ratio"]
                subtext_str += f"**Iceberg Ratio Target:** {ratio.get('explicit_percentage', 40)}% explicit / {ratio.get('implicit_percentage', 60)}% implicit\n\n"

            if subtext_design.get("dialogue_subtext"):
                dialogue_sub = subtext_design["dialogue_subtext"]
                subtext_str += "**Dialogue Subtext Mapping:**\n"
                for entry in dialogue_sub if isinstance(dialogue_sub, list) else [dialogue_sub]:
                    if isinstance(entry, dict):
                        subtext_str += f"- Surface: \"{entry.get('surface_meaning', 'N/A')}\" → Hidden: \"{entry.get('hidden_meaning', 'N/A')}\"\n"
                subtext_str += "\n"

            if subtext_design.get("behavioral_subtext"):
                behavioral = subtext_design["behavioral_subtext"]
                subtext_str += "**Behavioral Subtext:**\n"
                for entry in behavioral if isinstance(behavioral, list) else [behavioral]:
                    if isinstance(entry, dict):
                        subtext_str += f"- Action: \"{entry.get('action', 'N/A')}\" reveals \"{entry.get('hidden_emotion', 'N/A')}\"\n"
                subtext_str += "\n"

            if subtext_design.get("environmental_subtext"):
                env_sub = subtext_design["environmental_subtext"]
                subtext_str += "**Environmental Subtext:**\n"
                subtext_str += f"- {env_sub if isinstance(env_sub, str) else json.dumps(env_sub)}\n\n"

            if subtext_design.get("secret_motivations"):
                secrets = subtext_design["secret_motivations"]
                subtext_str += "**Secret Motivations (Never State Directly):**\n"
                for entry in secrets if isinstance(secrets, list) else [secrets]:
                    if isinstance(entry, dict):
                        subtext_str += f"- {entry.get('character', 'Character')}: {entry.get('motivation', 'N/A')}\n"
                subtext_str += "\n"

        # Format motif target if available
        motif_str = ""
        if motif_target:
            motif_str = """
## Symbolic/Motif Layer (From Motif Bible)

IMPORTANT: Weave these symbolic elements naturally into your scene. Motifs should enhance meaning without being heavy-handed.

"""
            if motif_target.get("primary_motif"):
                motif_str += f"**Primary Motif:** {motif_target['primary_motif']}\n"
                motif_str += "This is the main symbolic element to feature in this scene.\n\n"

            if motif_target.get("secondary_motifs"):
                secondary = motif_target["secondary_motifs"]
                if isinstance(secondary, list):
                    motif_str += f"**Secondary Motifs:** {', '.join(secondary)}\n"
                else:
                    motif_str += f"**Secondary Motifs:** {secondary}\n"
                motif_str += "Weave these supporting motifs subtly throughout the scene.\n\n"

            if motif_target.get("visual_focus"):
                motif_str += f"**Visual Focus:** {motif_target['visual_focus']}\n"
                motif_str += "This is the key visual to emphasize in descriptions.\n\n"

            if motif_target.get("color_emphasis"):
                motif_str += f"**Color Emphasis:** {motif_target['color_emphasis']}\n"
                motif_str += "Use this color palette to reinforce the scene's mood and symbolism.\n\n"

            if motif_target.get("symbol_placement"):
                motif_str += f"**Symbol Placement:** {motif_target['symbol_placement']}\n\n"

            if motif_target.get("subtext_layer"):
                motif_str += f"**Symbolic Subtext:** {motif_target['subtext_layer']}\n"
                motif_str += "This is what the motifs communicate beneath the surface.\n\n"

            if motif_target.get("connection_to_theme"):
                motif_str += f"**Thematic Connection:** {motif_target['connection_to_theme']}\n\n"

        user_prompt = f"""
## Scene Context

**Scene Number:** {scene_number}
**Scene Title:** {scene.get("title", "Untitled")}

**Setting:** {scene.get("setting", "")}

**Characters Present:** {", ".join(scene.get("characters_present", []))}

**Conflict Type:** {scene.get("conflict_type", "HeroVsSelf")}
**Conflict Description:** {scene.get("conflict_description", "")}

**Emotional Beat:**
- Initial State: {emotional_beat.get("initial_state", "")}
- Climax: {emotional_beat.get("climax", "")}
- Final State: {emotional_beat.get("final_state", "")}

**Subtext Layer:** {scene.get("subtext_layer", "")}

**Plot Advancement:** {scene.get("plot_advancement", "")}

**Character Development:** {scene.get("character_development", "")}

**Target Word Count:** {scene.get("estimated_word_count", 1500)}

## Character Profiles

{character_profiles_str}

## Worldbuilding Context

{json.dumps(worldbuilding, indent=2) if worldbuilding else "N/A"}

## Previous Scene Summary

{previous_scene_summary}
{memory_context_str}
{constraints_context_str}
{narrator_str}
{sensory_str}
{subtext_str}
{motif_str}
## Style Guidelines

**Moral Compass:** {moral_compass}

---

Write this scene following the outline. Output as valid JSON with narrative_content, sensory_details, dialogue_entries, etc.
"""

        # Add change request section if provided
        if change_request:
            user_prompt += f"""

---

## IMPORTANT: User Change Request (MUST SATISFY)

The user has requested the following changes that you MUST incorporate:

> {change_request}

Make sure your output reflects these requirements.
"""

        # Writer creates initial draft
        writer_response = await self._call_agent(self.writer, user_prompt)
        writer_msg = self._parse_agent_message("Writer", writer_response)
        self.state.messages.append(writer_msg)

        draft = writer_msg.content if isinstance(writer_msg.content, dict) else None

        # =======================================================================
        # INTELLIGENT DIAGNOSTIC PASS (Two-Pass Critic Analysis)
        # Instead of blind "first draft always rejected", we do intelligent analysis:
        # Pass A: Critic evaluates against strict rubric (JSON only, no APPROVED/REVISION)
        # Pass B: Critic identifies weakest link and provides targeted revision brief
        # This gives Writer specific, actionable feedback based on actual weaknesses.
        # =======================================================================
        if self.state.revision_count.get(scene_number, 0) == 0:
            logger.info(f"[run_drafting_phase] Scene {scene_number}: Starting two-pass Critic diagnostic")
            self._emit_event("diagnostic_pass_start", {
                "scene_number": scene_number,
                "reason": "First draft diagnostic analysis",
            })
            
            # ===== PASS A: Rubric Scan (JSON only, no APPROVED/REVISION_REQUEST) =====
            rubric_prompt = f"""
## DIAGNOSTIC RUBRIC SCAN - Scene {scene_number}

You are performing a diagnostic evaluation of this first draft. Output ONLY a JSON rubric - do NOT use the words "APPROVED" or "REVISION_REQUEST" in this response.

**Scene Title:** {scene.get("title", "Untitled")}

**Target Emotional Beat:**
- Initial: {emotional_beat.get("initial_state", "")}
- Climax: {emotional_beat.get("climax", "")}
- Final: {emotional_beat.get("final_state", "")}

**Required Subtext:** {scene.get("subtext_layer", "")}

## Scene Content

{json.dumps(draft, indent=2) if draft else writer_response}

## Character Profiles

{character_profiles_str}

---

## OUTPUT FORMAT (JSON ONLY)

Evaluate the draft and output ONLY this JSON structure:

{{
  "overall_score": <float 1-10>,
  "dimensions": {{
    "subtext_show_dont_tell": <int 1-10>,
    "didacticism_level": <int 1-10, where 1=very preachy, 10=no moralizing>,
    "originality": <int 1-10>,
    "emotional_impact": <int 1-10>,
    "sensory_specificity": <int 1-10>,
    "character_voice_authenticity": <int 1-10>,
    "dialogue_naturalness": <int 1-10>
  }},
  "didacticism_detected": <boolean>,
  "cliches_found": [<list of specific clichés/tropes identified>],
  "evidence_quotes": [<list of 2-3 problematic quotes from the text>],
  "weakness_candidates": [
    {{"dimension": "<weakest dimension name>", "score": <score>, "reason": "<why this is weak>"}},
    {{"dimension": "<second weakest>", "score": <score>, "reason": "<why>"}}
  ]
}}

Be strict. First drafts rarely score above 7.0. Output ONLY valid JSON, no other text.
"""
            
            rubric_response = await self._call_agent(self.critic, rubric_prompt)
            rubric_json = self._extract_json(rubric_response)
            
            if rubric_json:
                logger.info(f"[run_drafting_phase] Scene {scene_number}: Rubric scan complete - overall_score={rubric_json.get('overall_score')}, weaknesses={[w.get('dimension') for w in rubric_json.get('weakness_candidates', [])]}")
                self._emit_event("diagnostic_rubric_complete", {
                    "scene_number": scene_number,
                    "overall_score": rubric_json.get("overall_score"),
                    "dimensions": rubric_json.get("dimensions", {}),
                    "didacticism_detected": rubric_json.get("didacticism_detected", False),
                })
            else:
                logger.warning(f"[run_drafting_phase] Scene {scene_number}: Rubric scan failed to parse, using fallback")
                rubric_json = {"overall_score": 5.0, "weakness_candidates": [{"dimension": "general_quality", "reason": "Unable to parse rubric"}]}
            
            # ===== PASS B: Weakest Link Brief (targeted revision instructions) =====
            weakest_link_prompt = f"""
## WEAKEST LINK ANALYSIS - Scene {scene_number}

Based on the diagnostic rubric below, identify the SINGLE most critical weakness and provide a targeted revision brief.

## Diagnostic Rubric Results

{json.dumps(rubric_json, indent=2)}

## Scene Content (for reference)

{json.dumps(draft, indent=2) if draft else writer_response}

---

## YOUR TASK

1. Identify the WEAKEST LINK - the single most impactful issue to fix
2. Provide a SPECIFIC, ACTIONABLE revision brief

Output in this EXACT format:

WEAKEST_LINK: [name of the weakest dimension]
SEVERITY: [critical/major/moderate]
EVIDENCE: [quote the specific problematic text from the draft]
REVISION_REQUEST: [describe the specific problem in 1-2 sentences]
INSTRUCTIONS: [provide concrete, actionable steps to fix this ONE issue - be specific about what to change, add, or remove]

Focus on ONE thing. The Writer should know exactly what to fix and how.
"""
            
            weakest_link_response = await self._call_agent(self.critic, weakest_link_prompt)
            logger.info(f"[run_drafting_phase] Scene {scene_number}: Weakest link analysis complete")
            
            # Parse the weakest link response
            weakest_link = "general_quality"
            severity = "major"
            evidence = ""
            revision_issues = ""
            revision_instructions = ""
            
            for line in weakest_link_response.split("\n"):
                line_upper = line.upper().strip()
                if line_upper.startswith("WEAKEST_LINK:"):
                    weakest_link = line.split(":", 1)[1].strip() if ":" in line else weakest_link
                elif line_upper.startswith("SEVERITY:"):
                    severity = line.split(":", 1)[1].strip().lower() if ":" in line else severity
                elif line_upper.startswith("EVIDENCE:"):
                    evidence = line.split(":", 1)[1].strip() if ":" in line else evidence
                elif line_upper.startswith("REVISION_REQUEST:"):
                    revision_issues = line.split(":", 1)[1].strip() if ":" in line else revision_issues
                elif line_upper.startswith("INSTRUCTIONS:"):
                    revision_instructions = line.split(":", 1)[1].strip() if ":" in line else revision_instructions
            
            self._emit_event("diagnostic_weakest_link", {
                "scene_number": scene_number,
                "weakest_link": weakest_link,
                "severity": severity,
                "revision_issues": revision_issues,
            })
            
            # ===== Send targeted revision to Writer =====
            diagnostic_revision_prompt = f"""
## TARGETED REVISION - Scene {scene_number}

The Critic has analyzed your first draft and identified a specific area for improvement.

**Scene Title:** {scene.get("title", "Untitled")}

## DIAGNOSTIC RESULTS

**Overall Score:** {rubric_json.get('overall_score', 'N/A')}/10
**Weakest Link:** {weakest_link}
**Severity:** {severity}

## SPECIFIC ISSUE

{revision_issues}

**Evidence from your draft:**
> {evidence}

## REVISION INSTRUCTIONS

{revision_instructions}

## Your Current Draft

{json.dumps(draft, indent=2) if draft else writer_response}

---

Focus on fixing THIS ONE ISSUE. Make targeted changes to address the weakest link identified above.
Output your REVISED scene as valid JSON. This diagnostic revision does NOT count against your revision limit.
"""
            
            writer_response = await self._call_agent(
                self.writer,
                diagnostic_revision_prompt,
                [{"role": "assistant", "content": writer_response}],
            )
            writer_msg = self._parse_agent_message("Writer", writer_response)
            self.state.messages.append(writer_msg)
            draft = writer_msg.content if isinstance(writer_msg.content, dict) else draft
            logger.info(f"[run_drafting_phase] Scene {scene_number}: Diagnostic revision complete (fixed: {weakest_link}), proceeding to Critic review")

        # Critic reviews the draft (now reviewing the diagnostically-improved version)
        approved = False
        while not approved and self.state.revision_count[scene_number] < self.state.max_revisions:
            critique_prompt = f"""
## Scene Draft for Review

**Scene Number:** {scene_number}
**Scene Title:** {scene.get("title", "Untitled")}

**Target Emotional Beat:**
- Initial: {emotional_beat.get("initial_state", "")}
- Climax: {emotional_beat.get("climax", "")}
- Final: {emotional_beat.get("final_state", "")}

**Required Subtext:** {scene.get("subtext_layer", "")}

**Moral Compass:** {moral_compass}

## Scene Content

{json.dumps(draft, indent=2) if draft else writer_response}

## Character Profiles (for consistency check)

{character_profiles_str}

---

## STRICT EVALUATION CRITERIA (Be Harsh - First Pass Rarely Passes)

Provide a comprehensive critique evaluating:

1. **Subtext Quality (Critical)**: Does the scene SHOW rather than TELL? Are emotions implied through action rather than stated? Score below 8.0 if any character directly states their feelings or the theme is explained.

2. **Didacticism Check (Critical)**: Is there ANY moralizing, preaching, or on-the-nose thematic exposition? If yes, this is an automatic REVISION_REQUEST regardless of other scores.

3. **Originality**: Are there clichés, overused metaphors, or predictable plot beats? Each cliché found should lower the score.

4. **Emotional Impact**: Does the scene achieve its intended emotional beat through craft, not exposition?

**Scoring Guidelines:**
- Score 9.0+: Exceptional - rare, only for truly outstanding work
- Score 8.0-8.9: Strong - minor polish needed
- Score 7.0-7.9: Acceptable - some issues but passable
- Score < 7.0: Needs revision - significant issues

If the scene needs revision (score < 8.0 OR any didacticism detected), use:
REVISION_REQUEST: [specific issues] INSTRUCTIONS: [how to fix]

If approved (score >= 8.0 AND no didacticism), say APPROVED and output your critique as JSON.
Revision {self.state.revision_count[scene_number] + 1} of {self.state.max_revisions} maximum.
"""

            critic_response = await self._call_agent(self.critic, critique_prompt)
            critic_msg = self._parse_agent_message("Critic", critic_response)
            self.state.messages.append(critic_msg)

            # =======================================================================
            # BUG FIX #2: Stricter Approval Logic (Anti "Critic-Agreeer")
            # Don't auto-approve on unparseable responses. Require explicit approval.
            # Also check for didacticism indicators in the critique.
            # =======================================================================
            
            # Extract score from critique if available
            critic_score = None
            if isinstance(critic_msg.content, dict):
                critic_score = critic_msg.content.get("overall_score", critic_msg.content.get("score"))
            
            # Check for didacticism flags in the response
            didacticism_detected = any(term in critic_response.lower() for term in [
                "didactic", "moraliz", "preach", "on-the-nose", "tells rather than shows",
                "states emotion", "explains the theme", "heavy-handed"
            ])
            
            if didacticism_detected:
                logger.info(f"[run_drafting_phase] Scene {scene_number}: Didacticism detected in critique, forcing revision")
            
            # Stricter approval: require explicit APPROVED AND no didacticism AND score >= 8.0
            is_explicitly_approved = critic_msg.type == "approved" or "APPROVED" in critic_response.upper()
            score_passes = critic_score is None or critic_score >= 8.0  # If no score, don't block on it
            
            if is_explicitly_approved and not didacticism_detected and score_passes:
                approved = True
                logger.info(f"[run_drafting_phase] Scene {scene_number}: Approved (score={critic_score}, didacticism={didacticism_detected})")
                self._emit_event("scene_approved", {
                    "scene_number": scene_number,
                    "revisions": self.state.revision_count[scene_number],
                    "critic_score": critic_score,
                })
            elif critic_msg.type == "revision_request" or didacticism_detected or (critic_score and critic_score < 8.0):
                self.state.revision_count[scene_number] += 1
                
                # Build revision issues
                issues = ""
                instructions = ""
                if isinstance(critic_msg.content, dict):
                    issues = critic_msg.content.get("issues", "")
                    instructions = critic_msg.content.get("instructions", "")
                
                if didacticism_detected and "didactic" not in issues.lower():
                    issues += " CRITICAL: Didacticism/moralizing detected - remove all on-the-nose thematic exposition."
                    instructions += " Show the theme through character actions and consequences, never state it directly."

                logger.info(f"[run_drafting_phase] Scene {scene_number}: Revision requested (score={critic_score}, didacticism={didacticism_detected})")
                self._emit_event("revision_requested", {
                    "scene_number": scene_number,
                    "revision_number": self.state.revision_count[scene_number],
                    "issues": issues,
                    "didacticism_detected": didacticism_detected,
                })

                # Writer revises
                revision_prompt = f"""
The Critic requests revisions:

Issues: {issues}
Instructions: {instructions}

Please revise the scene to address these concerns.
This is revision {self.state.revision_count[scene_number]} of {self.state.max_revisions} maximum.
Output the revised scene as valid JSON.
"""
                writer_response = await self._call_agent(
                    self.writer,
                    revision_prompt,
                    [{"role": "assistant", "content": writer_response}],
                )
                writer_msg = self._parse_agent_message("Writer", writer_response)
                self.state.messages.append(writer_msg)
                draft = writer_msg.content if isinstance(writer_msg.content, dict) else draft
            else:
                # =======================================================================
                # BUG FIX: Don't auto-approve unparseable responses
                # If we can't parse the response, request clarification instead of approving
                # =======================================================================
                logger.warning(f"[run_drafting_phase] Scene {scene_number}: Unparseable critic response, requesting revision for safety")
                self.state.revision_count[scene_number] += 1
                
                self._emit_event("revision_requested", {
                    "scene_number": scene_number,
                    "revision_number": self.state.revision_count[scene_number],
                    "issues": "Critic response unclear - applying standard refinement",
                })
                
                # Request standard refinement
                revision_prompt = f"""
The previous review was unclear. Please apply these standard refinements:

1. Tighten all subtext - ensure emotions are shown, not told
2. Remove any didactic or moralizing passages
3. Subvert any obvious clichés
4. Strengthen sensory details

This is revision {self.state.revision_count[scene_number]} of {self.state.max_revisions} maximum.
Output the revised scene as valid JSON.
"""
                writer_response = await self._call_agent(
                    self.writer,
                    revision_prompt,
                    [{"role": "assistant", "content": writer_response}],
                )
                writer_msg = self._parse_agent_message("Writer", writer_response)
                self.state.messages.append(writer_msg)
                draft = writer_msg.content if isinstance(writer_msg.content, dict) else draft

        # If max revisions reached, approve with notes
        if not approved:
            self._emit_event("max_revisions_reached", {
                "scene_number": scene_number,
            })

        self.state.drafts[scene_number] = draft
        critique = critic_msg.content if isinstance(critic_msg.content, dict) else None
        if scene_number not in self.state.critiques:
            self.state.critiques[scene_number] = []
        self.state.critiques[scene_number].append(critique)

        # =======================================================================
        # LAZY WRITER PATTERN: Extract new_developments from Writer output
        # Writer generates raw facts in natural language, Archivist converts to canonical keys
        # =======================================================================
        if draft and isinstance(draft, dict):
            new_developments = draft.get("new_developments", [])
            if new_developments:
                logger.info(f"[run_drafting_phase] Scene {scene_number}: Collected {len(new_developments)} new developments")
                for dev in new_developments:
                    if isinstance(dev, dict):
                        # Store raw fact for Archivist to process
                        fact_str = f"{dev.get('subject', 'Unknown')}: {dev.get('change', 'Unknown change')} (category: {dev.get('category', 'unknown')})"
                        self.add_raw_fact(fact_str, scene_number, source_agent="writer")
                
                self._emit_event("new_developments_collected", {
                    "scene_number": scene_number,
                    "count": len(new_developments),
                    "developments": new_developments,
                })

        # =======================================================================
        # ARCHIVIST TRIGGER: Check if we should run Archivist (async, non-blocking)
        # Runs every ARCHIVIST_SNAPSHOT_INTERVAL scenes to resolve constraints
        # =======================================================================
        if self.should_run_archivist(scene_number):
            logger.info(f"[run_drafting_phase] Scene {scene_number}: Triggering Archivist snapshot (async)")
            # Use asyncio.create_task to run Archivist without blocking drafting
            import asyncio
            asyncio.create_task(
                self.run_archivist_snapshot(
                    current_scene=scene_number,
                    characters=characters,
                    plot_phase="drafting",
                )
            )

        self._emit_event("phase_complete", {
            "phase": "drafting",
            "scene_number": scene_number,
            "approved": approved,
            "revisions": self.state.revision_count[scene_number],
        })

        return {
            "draft": draft,
            "critique": critique,
            "approved": approved,
            "revision_count": self.state.revision_count[scene_number],
            "messages": [
                {"agent": m.from_agent, "type": m.type}
                for m in self.state.messages[-10:]  # Last 10 messages
            ],
        }

    async def run_polish_phase(
        self,
        scene_number: int,
        draft: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        critique: Optional[Dict[str, Any]] = None,
        change_request: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run the Final Polish phase on an approved scene draft.
        Focuses on sentence-level refinement, rhythm, and consistency.

        Args:
            scene_number: The scene number being polished
            draft: The approved scene draft
            characters: List of character profiles for voice consistency
            moral_compass: Moral compass setting for the story
            critique: Optional final critique notes from the Critic
        """
        self.state.phase = GenerationPhase.POLISH

        self._emit_event("phase_start", {
            "phase": "polish",
            "scene_number": scene_number,
        })

        # Format character profiles for voice consistency check
        present_characters = draft.get("characters_present", [])
        character_profiles_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}**\n"
            f"- Visual Signature: {c.get('visual_signature', 'Unknown')}\n"
            f"- Quirks: {', '.join(c.get('quirks', []))}\n"
            f"- Coping Mechanism: {c.get('coping_mechanism', 'Unknown')}"
            for c in characters
            if c.get("name") in present_characters
        ])

        # Format sensory details
        sensory_details = draft.get("sensory_details", {})
        sensory_str = "\n".join([
            f"- {sense.capitalize()}: {detail}"
            for sense, detail in sensory_details.items()
            if detail
        ]) if sensory_details else "No sensory details provided"

        # Format dialogue entries
        dialogue_entries = draft.get("dialogue_entries", [])
        dialogue_str = "\n".join([
            f"**{d.get('speaker', 'Unknown')}**: \"{d.get('line', '')}\""
            for d in dialogue_entries
        ]) if dialogue_entries else "No dialogue entries"

        # Format critic notes
        critic_notes = ""
        if critique:
            critic_notes = f"""
**Overall Score:** {critique.get('overall_score', 'N/A')}
**Strengths:** {', '.join(critique.get('strengths', []))}
**Areas for Polish:** {', '.join(critique.get('revision_focus', []))}
"""

        polish_prompt = f"""
## Scene for Final Polish

**Scene Number:** {scene_number}
**Scene Title:** {draft.get('scene_title', 'Untitled')}

**Moral Compass:** {moral_compass}

## Approved Scene Content

{draft.get('narrative_content', json.dumps(draft, indent=2))}

## Sensory Details

{sensory_str}

## Dialogue Entries

{dialogue_str}

## Character Profiles (for voice consistency)

{character_profiles_str}

## Critic's Final Notes

{critic_notes}

---

Perform a final polish pass on this approved scene. Focus on:
1. Sentence rhythm and flow - vary sentence length for dynamic prose
2. Word choice precision - replace weak verbs, eliminate unnecessary adverbs
3. Redundancy elimination - cut repeated information and filler words
4. Dialogue polish - ensure natural speech patterns and distinct character voices
5. Opening and closing lines - strengthen hooks and resonant endings

Make surgical improvements that elevate the prose without changing the meaning or voice.
Output as valid JSON with the polished content and a summary of changes made.
"""

        # Add change request section if provided
        if change_request:
            polish_prompt += f"""

---

## IMPORTANT: User Change Request (MUST SATISFY)

The user has requested the following changes that you MUST incorporate:

> {change_request}

Make sure your output reflects these requirements.
"""

        polish_response = await self._call_agent(self.polish, polish_prompt)
        polish_msg = self._parse_agent_message("Polish", polish_response)
        self.state.messages.append(polish_msg)

        polished_content = polish_msg.content if isinstance(polish_msg.content, dict) else draft

        self._emit_event("phase_complete", {
            "phase": "polish",
            "scene_number": scene_number,
        })

        return {
            "polished_draft": polished_content,
            "original_draft": draft,
            "changes_summary": polished_content.get("polish_summary", "") if isinstance(polished_content, dict) else "",
        }

    async def run_originality_check(
        self,
        scene_number: int,
        draft: Dict[str, Any],
        moral_compass: str,
        target_audience: str,
        emotional_beat: Optional[Dict[str, Any]] = None,
        genre_context: str = "General Fiction",
    ) -> Dict[str, Any]:
        """
        Run the Originality Check phase on a scene draft.
        Identifies cliches, overused tropes, and predictable elements.

        Args:
            scene_number: The scene number being checked
            draft: The scene draft to analyze
            moral_compass: Moral compass setting for the story
            target_audience: Target audience for context
            emotional_beat: Optional emotional beat information
            genre_context: Genre context for trope evaluation
        """
        self.state.phase = GenerationPhase.ORIGINALITY_CHECK

        self._emit_event("phase_start", {
            "phase": "originality_check",
            "scene_number": scene_number,
        })

        # Format sensory details
        sensory_details = draft.get("sensory_details", {})
        sensory_str = "\n".join([
            f"- {sense.capitalize()}: {', '.join(detail) if isinstance(detail, list) else detail}"
            for sense, detail in sensory_details.items()
            if detail
        ]) if sensory_details else "No sensory details provided"

        # Format dialogue entries
        dialogue_entries = draft.get("dialogue_entries", [])
        dialogue_str = "\n".join([
            f"**{d.get('speaker', 'Unknown')}**: \"{d.get('spoken_text', d.get('line', ''))}\""
            for d in dialogue_entries
        ]) if dialogue_entries else "No dialogue entries"

        # Format emotional beat (normalize to handle string values)
        emotional_initial = ""
        emotional_climax = ""
        emotional_final = ""
        if emotional_beat:
            normalized_beat = _normalize_dict(emotional_beat, fallback_key="initial_state")
            emotional_initial = normalized_beat.get("initial_state", "")
            emotional_climax = normalized_beat.get("climax", "")
            emotional_final = normalized_beat.get("final_state", "")

        originality_prompt = f"""
## Scene for Originality Analysis

**Scene Number:** {scene_number}
**Scene Title:** {draft.get('title', draft.get('scene_title', 'Untitled'))}

**Genre/Style Context:** {genre_context}

**Moral Compass:** {moral_compass}

**Target Audience:** {target_audience}

## Scene Content

{draft.get('narrative_content', json.dumps(draft, indent=2))}

## Sensory Details

{sensory_str}

## Dialogue Entries

{dialogue_str}

## Intended Emotional Beat

- Initial: {emotional_initial}
- Climax: {emotional_climax}
- Final: {emotional_final}

## Previous Originality Issues (if revision)

N/A

---

Analyze this scene for originality. Identify cliches, evaluate trope usage, assess predictability, and provide specific suggestions for making the narrative fresher and more original. Output as valid JSON following the specified schema.
"""

        originality_response = await self._call_agent(self.originality, originality_prompt)
        originality_msg = self._parse_agent_message("Originality", originality_response)
        self.state.messages.append(originality_msg)

        originality_result = originality_msg.content if isinstance(originality_msg.content, dict) else {}

        # Determine if revision is required based on score
        # BUG FIX #3: Raised threshold from 6.0 to 8.0 - originality is now a hard blocker
        originality_score = originality_result.get("originality_score", 10)
        originality_threshold = 8.0  # Was 6.0 - now stricter to force trope subversion
        revision_required = originality_score < originality_threshold or originality_result.get("revision_required", False)
        
        logger.info(f"[run_originality_check] Scene {scene_number}: score={originality_score}, threshold={originality_threshold}, revision_required={revision_required}")

        self._emit_event("phase_complete", {
            "phase": "originality_check",
            "scene_number": scene_number,
            "originality_score": originality_score,
            "revision_required": revision_required,
        })

        return {
            "originality_analysis": originality_result,
            "originality_score": originality_score,
            "revision_required": revision_required,
            "cliche_count": len(originality_result.get("cliche_instances", [])),
            "flagged_sections": originality_result.get("flagged_sections", []),
        }

    async def run_impact_assessment(
        self,
        scene_number: int,
        draft: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        target_audience: str,
        emotional_beat: Optional[Dict[str, Any]] = None,
        genre_context: str = "General Fiction",
    ) -> Dict[str, Any]:
        """
        Run the Impact Assessment phase on a scene draft.
        Evaluates emotional impact and alignment with intended beats.

        Args:
            scene_number: The scene number being assessed
            draft: The scene draft to analyze
            characters: List of character profiles for context
            moral_compass: Moral compass setting for the story
            target_audience: Target audience for calibration
            emotional_beat: Optional intended emotional beat information
            genre_context: Genre context for impact expectations
        """
        self.state.phase = GenerationPhase.IMPACT_ASSESSMENT

        self._emit_event("phase_start", {
            "phase": "impact_assessment",
            "scene_number": scene_number,
        })

        # Format character context
        present_characters = draft.get("characters_present", [])
        character_context_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}**\n"
            f"- Core Motivation: {c.get('core_motivation', 'Unknown')}\n"
            f"- Inner Trap: {c.get('inner_trap', 'Unknown')}\n"
            f"- Psychological Wound: {c.get('psychological_wound', 'Unknown')}\n"
            f"- Deepest Fear: {c.get('deepest_fear', 'Unknown')}"
            for c in characters
            if c.get("name") in present_characters
        ]) if present_characters else "\n\n".join([
            f"**{c.get('name', 'Unknown')}**\n"
            f"- Core Motivation: {c.get('core_motivation', 'Unknown')}\n"
            f"- Inner Trap: {c.get('inner_trap', 'Unknown')}"
            for c in characters[:3]  # Include first 3 characters if none specified
        ])

        # Format sensory details
        sensory_details = draft.get("sensory_details", {})
        sensory_str = "\n".join([
            f"- {sense.capitalize()}: {', '.join(detail) if isinstance(detail, list) else detail}"
            for sense, detail in sensory_details.items()
            if detail
        ]) if sensory_details else "No sensory details provided"

        # Format dialogue entries
        dialogue_entries = draft.get("dialogue_entries", [])
        dialogue_str = "\n".join([
            f"**{d.get('speaker', 'Unknown')}**: \"{d.get('spoken_text', d.get('line', ''))}\""
            for d in dialogue_entries
        ]) if dialogue_entries else "No dialogue entries"

        # Format emotional beat (normalize to handle string values)
        emotional_initial = ""
        emotional_climax = ""
        emotional_final = ""
        if emotional_beat:
            normalized_beat = _normalize_dict(emotional_beat, fallback_key="initial_state")
            emotional_initial = normalized_beat.get("initial_state", "")
            emotional_climax = normalized_beat.get("climax", "")
            emotional_final = normalized_beat.get("final_state", "")

        impact_prompt = f"""
## Scene for Impact Assessment

**Scene Number:** {scene_number}
**Scene Title:** {draft.get('title', draft.get('scene_title', 'Untitled'))}

**Genre/Style Context:** {genre_context}

**Moral Compass:** {moral_compass}

**Target Audience:** {target_audience}

## Intended Emotional Beat

- **Initial State:** {emotional_initial}
- **Climax:** {emotional_climax}
- **Final State:** {emotional_final}

## Scene Content

{draft.get('narrative_content', json.dumps(draft, indent=2))}

## Sensory Details

{sensory_str}

## Dialogue Entries

{dialogue_str}

## Character Context

{character_context_str}

## Previous Impact Issues (if revision)

N/A

---

Assess the emotional impact of this scene. Evaluate how well the intended emotional beats are achieved, analyze the depth and layers of emotional engagement, assess the effectiveness of craft techniques, and provide specific suggestions for enhancing impact. Output as valid JSON following the specified schema.
"""

        impact_response = await self._call_agent(self.impact, impact_prompt)
        impact_msg = self._parse_agent_message("Impact", impact_response)
        self.state.messages.append(impact_msg)

        impact_result = impact_msg.content if isinstance(impact_msg.content, dict) else {}

        # Determine if revision is required based on score
        impact_score = impact_result.get("impact_score", 10)
        revision_required = impact_score < 6.0 or impact_result.get("revision_required", False)

        # Extract emotional effectiveness details
        emotional_effectiveness = impact_result.get("emotional_effectiveness", {})
        beat_alignment = {
            "initial": emotional_effectiveness.get("initial_alignment", 0),
            "climax": emotional_effectiveness.get("climax_alignment", 0),
            "final": emotional_effectiveness.get("final_alignment", 0),
        }

        self._emit_event("phase_complete", {
            "phase": "impact_assessment",
            "scene_number": scene_number,
            "impact_score": impact_score,
            "revision_required": revision_required,
        })

        return {
            "impact_analysis": impact_result,
            "impact_score": impact_score,
            "revision_required": revision_required,
            "beat_alignment": beat_alignment,
            "weak_sections": impact_result.get("weak_sections", []),
            "enhancement_suggestions": impact_result.get("enhancement_suggestions", []),
        }

    async def run_quality_gate(
        self,
        scene_number: int,
        draft: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        target_audience: str,
        emotional_beat: Optional[Dict[str, Any]] = None,
        critique: Optional[Dict[str, Any]] = None,
        genre_context: str = "General Fiction",
        quality_thresholds: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        Run the complete quality gate: Originality Check + Impact Assessment.
        Returns combined quality metrics and determines if scene passes quality standards.

        Args:
            scene_number: The scene number being evaluated
            draft: The scene draft to analyze
            characters: List of character profiles
            moral_compass: Moral compass setting
            target_audience: Target audience
            emotional_beat: Intended emotional beat
            critique: Optional critique from Critic agent
            genre_context: Genre context
            quality_thresholds: Optional custom thresholds (defaults provided)
        """
        # =======================================================================
        # BUG FIX #3: Stricter Quality Thresholds (Anti "Formal Originality Check")
        # Originality is now a HARD BLOCKER with threshold 8.0 (was 6.0)
        # This forces Writer to subvert clichés rather than just acknowledge them
        # =======================================================================
        thresholds = quality_thresholds or {
            "critic_overall": 8.0,      # Was 7.0 - raised for stricter quality
            "critic_category_min": 6,   # Was 5 - raised for stricter quality
            "originality_score": 8.0,   # Was 6.0 - CRITICAL: This is now a hard blocker
            "impact_score": 7.0,        # Was 6.0 - raised for stricter quality
        }
        
        logger.info(f"[run_quality_gate] Scene {scene_number}: Starting quality gate with thresholds: {thresholds}")

        self._emit_event("quality_gate_start", {
            "scene_number": scene_number,
            "thresholds": thresholds,
        })

        # Run originality check
        originality_result = await self.run_originality_check(
            scene_number=scene_number,
            draft=draft,
            moral_compass=moral_compass,
            target_audience=target_audience,
            emotional_beat=emotional_beat,
            genre_context=genre_context,
        )

        # Run impact assessment
        impact_result = await self.run_impact_assessment(
            scene_number=scene_number,
            draft=draft,
            characters=characters,
            moral_compass=moral_compass,
            target_audience=target_audience,
            emotional_beat=emotional_beat,
            genre_context=genre_context,
        )

        # Evaluate critic scores if available
        critic_passed = True
        critic_issues = []
        if critique:
            overall_score = critique.get("overall_score", 10)
            if overall_score < thresholds["critic_overall"]:
                critic_passed = False
                critic_issues.append(f"Overall score {overall_score} below threshold {thresholds['critic_overall']}")

            # Check individual category scores
            feedback_items = critique.get("feedback_items", [])
            for item in feedback_items:
                score = item.get("score", 10)
                if score < thresholds["critic_category_min"]:
                    critic_passed = False
                    critic_issues.append(
                        f"Category '{item.get('category', 'Unknown')}' score {score} below minimum {thresholds['critic_category_min']}"
                    )

        # Determine overall quality gate pass/fail
        originality_passed = originality_result["originality_score"] >= thresholds["originality_score"]
        impact_passed = impact_result["impact_score"] >= thresholds["impact_score"]

        quality_passed = critic_passed and originality_passed and impact_passed
        
        # Log decision inputs for debugging
        logger.info(f"[run_quality_gate] Scene {scene_number}: DECISION INPUTS - "
                   f"critic_passed={critic_passed}, "
                   f"originality_score={originality_result['originality_score']} (threshold={thresholds['originality_score']}), "
                   f"impact_score={impact_result['impact_score']} (threshold={thresholds['impact_score']})")
        logger.info(f"[run_quality_gate] Scene {scene_number}: GATE DECISION - quality_passed={quality_passed}")

        # Compile issues for revision
        revision_issues = []
        revision_tags = []  # Tags to guide revision focus
        
        if not critic_passed:
            revision_issues.extend(critic_issues)
            revision_tags.append("IMPROVE_CRAFT")
            
        if not originality_passed:
            # =======================================================================
            # BUG FIX #3 CONTINUED: Add "Subvert Tropes" tag for low originality
            # This explicitly tells Writer to subvert clichés, not just acknowledge them
            # =======================================================================
            revision_issues.append(f"CRITICAL: Originality score {originality_result['originality_score']} below threshold {thresholds['originality_score']}")
            revision_issues.append("ACTION REQUIRED: Subvert at least 2 clichés/tropes identified below")
            revision_tags.append("SUBVERT_TROPES")  # Key tag for Writer
            
            # List specific clichés to subvert
            cliches = originality_result.get("flagged_sections", [])
            for i, c in enumerate(cliches[:5]):  # Show up to 5 clichés
                cliche_text = c.get('text', c.get('cliche', 'Unknown'))
                severity = c.get('severity', 'moderate')
                revision_issues.append(f"  [{i+1}] Cliché ({severity}): {cliche_text}")
            
            logger.info(f"[run_quality_gate] Scene {scene_number}: Originality FAILED - {len(cliches)} clichés found, adding SUBVERT_TROPES tag")
            
        if not impact_passed:
            revision_issues.append(f"Impact score {impact_result['impact_score']} below threshold {thresholds['impact_score']}")
            revision_tags.append("STRENGTHEN_IMPACT")
            revision_issues.extend([
                f"Weak section: {s.get('location', 'Unknown')}" for s in impact_result.get("weak_sections", [])[:3]
            ])

        self._emit_event("quality_gate_complete", {
            "scene_number": scene_number,
            "quality_passed": quality_passed,
            "originality_score": originality_result["originality_score"],
            "impact_score": impact_result["impact_score"],
            "critic_passed": critic_passed,
        })

        return {
            "quality_passed": quality_passed,
            "originality_result": originality_result,
            "impact_result": impact_result,
            "critic_passed": critic_passed,
            "critic_issues": critic_issues,
            "revision_issues": revision_issues,
            "revision_tags": revision_tags,  # Tags like SUBVERT_TROPES, IMPROVE_CRAFT, STRENGTHEN_IMPACT
            "scores": {
                "originality": originality_result["originality_score"],
                "impact": impact_result["impact_score"],
                "critic_overall": critique.get("overall_score") if critique else None,
            },
            "thresholds": thresholds,
        }

    async def run_quality_revision(
        self,
        scene_number: int,
        draft: Dict[str, Any],
        quality_result: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        scene_context: str = "",
    ) -> Dict[str, Any]:
        """
        Revise a scene draft based on quality gate feedback.
        Sends the draft back to Writer with specific issues to address.

        Args:
            scene_number: The scene number being revised
            draft: The current scene draft
            quality_result: The quality gate result with issues
            characters: List of character profiles
            moral_compass: Moral compass setting
            scene_context: Context about the scene for continuity
        """
        self._emit_event("quality_revision_start", {
            "scene_number": scene_number,
            "issues_count": len(quality_result.get("revision_issues", [])),
            "scores": quality_result.get("scores", {}),
        })

        # Format the quality feedback for Writer
        issues = quality_result.get("revision_issues", [])
        scores = quality_result.get("scores", {})
        thresholds = quality_result.get("thresholds", {"originality_score": 8.0, "impact_score": 7.0, "critic_overall": 8.0})
        revision_tags = quality_result.get("revision_tags", [])
        originality_result = quality_result.get("originality_result", {})
        impact_result = quality_result.get("impact_result", {})
        
        logger.info(f"[run_quality_revision] Scene {scene_number}: Starting revision with tags={revision_tags}, scores={scores}")

        # Build detailed feedback
        feedback_sections = []

        # Score summary with ACTUAL thresholds (not hardcoded old values)
        feedback_sections.append(f"""## Quality Gate Results

Your scene did not pass the quality gate. Please revise to address the following issues:

**Current Scores:**
- Originality: {scores.get('originality', 'N/A')} (threshold: {thresholds.get('originality_score', 8.0)})
- Impact: {scores.get('impact', 'N/A')} (threshold: {thresholds.get('impact_score', 7.0)})
- Critic Overall: {scores.get('critic_overall', 'N/A')} (threshold: {thresholds.get('critic_overall', 8.0)})

**Revision Tags:** {', '.join(revision_tags) if revision_tags else 'None'}
""")

        # =======================================================================
        # BUG FIX #3 CONTINUED: SUBVERT_TROPES specific instructions
        # When originality fails, give Writer concrete guidance on HOW to subvert
        # =======================================================================
        if "SUBVERT_TROPES" in revision_tags:
            flagged = originality_result.get("flagged_sections", [])
            suggestions = originality_result.get("suggestions", [])
            feedback_sections.append("""## CRITICAL: Originality Issues - SUBVERT TROPES REQUIRED

Your scene contains clichés that MUST be subverted, not just acknowledged. For each cliché below:
1. Identify the reader's expectation
2. Set up that expectation in your revision
3. Then SUBVERT it - deliver something unexpected that still serves the story

**Clichés to Subvert (pick at least 2):**
""")
            for i, section in enumerate(flagged[:5]):
                cliche_text = section.get('text', section.get('cliche', section.get('description', 'Unknown')))
                feedback_sections.append(f"  [{i+1}] {cliche_text}")
            
            feedback_sections.append("""
**Subversion Techniques:**
- Invert the outcome (hero fails, villain shows mercy)
- Change the motivation (expected reason is wrong)
- Shift perspective (show familiar scene from unexpected POV)
- Add complication (expected resolution creates new problem)
- Undercut with realism (fantasy trope meets mundane reality)

Do NOT simply remove the trope - SUBVERT it to create something fresh.
""")
            if suggestions:
                feedback_sections.append("**Specific Suggestions:**")
                for sug in suggestions[:3]:
                    feedback_sections.append(f"- {sug}")
        
        # Standard originality issues (when not using SUBVERT_TROPES tag)
        elif originality_result.get("originality_score", 10) < thresholds.get("originality_score", 8.0):
            flagged = originality_result.get("flagged_sections", [])
            suggestions = originality_result.get("suggestions", [])
            feedback_sections.append("""## Originality Issues

The scene contains clichés or overused tropes that reduce its freshness:
""")
            for section in flagged[:5]:
                feedback_sections.append(f"- **{section.get('type', 'Issue')}**: {section.get('text', section.get('description', 'Unknown'))}")
            if suggestions:
                feedback_sections.append("\n**Suggestions:**")
                for sug in suggestions[:3]:
                    feedback_sections.append(f"- {sug}")

        # Impact issues (using dynamic threshold)
        if impact_result.get("impact_score", 10) < thresholds.get("impact_score", 7.0):
            weak_sections = impact_result.get("weak_sections", [])
            enhancements = impact_result.get("enhancement_suggestions", [])
            feedback_sections.append("""## Impact Issues

The scene's emotional impact needs strengthening:
""")
            for section in weak_sections[:5]:
                feedback_sections.append(f"- **{section.get('location', 'Section')}**: {section.get('issue', section.get('description', 'Weak impact'))}")
            if enhancements:
                feedback_sections.append("\n**Enhancement Suggestions:**")
                for enh in enhancements[:3]:
                    feedback_sections.append(f"- {enh}")

        # General issues
        if issues:
            feedback_sections.append("\n## All Issues to Address\n")
            for issue in issues:
                feedback_sections.append(f"- {issue}")

        feedback_text = "\n".join(feedback_sections)

        # Format character profiles for context
        character_profiles_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}**: {c.get('role', 'Unknown role')}"
            for c in characters[:5]
        ])

        # Create revision prompt for Writer
        revision_prompt = f"""
## Quality Revision Required - Scene {scene_number}

{feedback_text}

## Current Draft

**Scene Title:** {draft.get('scene_title', 'Untitled')}

**Narrative Content:**
{draft.get('narrative_content', json.dumps(draft, indent=2))}

## Characters Present
{character_profiles_str}

## Moral Compass
{moral_compass}

---

## Revision Instructions

Please revise this scene to address the quality issues above. Focus on:

1. **Originality**: Replace clichés with fresh, unexpected alternatives. Subvert tropes or find unique angles.
2. **Impact**: Strengthen emotional resonance. Show don't tell. Use sensory details and character reactions.
3. **Maintain Continuity**: Keep all plot points, character actions, and story facts intact.
4. **Preserve Structure**: Output the revised scene in the same JSON format with all required fields.

Output your revised scene as valid JSON with the same structure as the original draft.
"""

        # Call Writer for revision
        revision_response = await self._call_agent(self.writer, revision_prompt)
        revision_msg = self._parse_agent_message("Writer", revision_response)
        self.state.messages.append(revision_msg)

        revised_draft = revision_msg.content if isinstance(revision_msg.content, dict) else draft

        self._emit_event("quality_revision_complete", {
            "scene_number": scene_number,
            "revised": True,
        })

        return {
            "revised_draft": revised_draft,
            "original_draft": draft,
            "feedback_given": feedback_text,
        }

    async def enforce_quality_for_scene(
        self,
        scene_number: int,
        draft: Dict[str, Any],
        characters: List[Dict[str, Any]],
        moral_compass: str,
        target_audience: str,
        emotional_beat: Optional[Dict[str, Any]] = None,
        critique: Optional[Dict[str, Any]] = None,
        max_quality_retries: int = 2,
        scene_context: str = "",
    ) -> Dict[str, Any]:
        """
        Enforce quality standards for a scene with retry logic.
        Runs quality gate and revises the scene if it fails, up to max_quality_retries.

        Args:
            scene_number: The scene number
            draft: The initial scene draft
            characters: List of character profiles
            moral_compass: Moral compass setting
            target_audience: Target audience
            emotional_beat: Intended emotional beat
            critique: Optional critique from Critic
            max_quality_retries: Maximum revision attempts (default: 2)
            scene_context: Context for continuity

        Returns:
            Dict with final draft, quality results, and attempt history
        """
        current_draft = draft
        current_critique = critique
        attempts = []

        for attempt in range(max_quality_retries + 1):
            self._emit_event("quality_enforcement_attempt", {
                "scene_number": scene_number,
                "attempt": attempt + 1,
                "max_attempts": max_quality_retries + 1,
            })

            # Run quality gate
            quality_result = await self.run_quality_gate(
                scene_number=scene_number,
                draft=current_draft,
                characters=characters,
                moral_compass=moral_compass,
                target_audience=target_audience,
                emotional_beat=emotional_beat,
                critique=current_critique,
            )

            attempts.append({
                "attempt": attempt + 1,
                "quality_passed": quality_result["quality_passed"],
                "scores": quality_result["scores"],
                "issues": quality_result["revision_issues"],
            })

            # If quality passed, we're done
            if quality_result["quality_passed"]:
                self._emit_event("quality_enforcement_passed", {
                    "scene_number": scene_number,
                    "attempt": attempt + 1,
                    "scores": quality_result["scores"],
                })
                return {
                    "final_draft": current_draft,
                    "quality_passed": True,
                    "quality_result": quality_result,
                    "attempts": attempts,
                    "retries_used": attempt,
                }

            # If this was the last attempt, exit loop
            if attempt >= max_quality_retries:
                break

            # Revise the draft based on quality feedback
            revision_result = await self.run_quality_revision(
                scene_number=scene_number,
                draft=current_draft,
                quality_result=quality_result,
                characters=characters,
                moral_compass=moral_compass,
                scene_context=scene_context,
            )

            current_draft = revision_result["revised_draft"]
            # Note: We don't re-run Critic here to save time/cost
            # The quality gate will still check originality and impact

        # Max retries exhausted, quality still not passed
        self._emit_event("quality_enforcement_exhausted", {
            "scene_number": scene_number,
            "max_attempts": max_quality_retries + 1,
            "final_scores": quality_result["scores"],
        })

        return {
            "final_draft": current_draft,
            "quality_passed": False,
            "quality_result": quality_result,
            "attempts": attempts,
            "retries_used": max_quality_retries,
            "retries_exhausted": True,
        }

    # =========================================================================
    # Narrator Design (Storyteller Section 3.2)
    # =========================================================================

    async def run_narrator_design(
        self,
        narrative: Dict[str, Any],
        characters: List[Dict[str, Any]],
        narrator_preferences: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate a comprehensive Narrator Design artifact based on story context.

        This creates a first-class artifact that goes beyond basic POV selection
        to establish a distinctive narrative voice with detailed voice characteristics.

        Args:
            narrative: Narrative context from Genesis phase
            characters: Character profiles from Profiler
            narrator_preferences: Optional user preferences for POV, reliability, stance
        """
        self._emit_event("phase_start", {"phase": "narrator_design"})

        # Extract user preferences or use defaults
        pov_pref = "not specified (choose based on story)"
        reliability_pref = "not specified (choose based on story)"
        stance_pref = "not specified (choose based on story)"

        if narrator_preferences:
            pov_map = {
                "first_person": "First Person (I/We)",
                "third_person_limited": "Third Person Limited",
                "third_person_omniscient": "Third Person Omniscient",
                "second_person": "Second Person (You)",
            }
            reliability_map = {
                "reliable": "Reliable",
                "unreliable": "Unreliable",
            }
            stance_map = {
                "objective": "Objective",
                "judgmental": "Judgmental",
                "sympathetic": "Sympathetic",
            }
            pov_pref = pov_map.get(narrator_preferences.get("pov", ""), pov_pref)
            reliability_pref = reliability_map.get(narrator_preferences.get("reliability", ""), reliability_pref)
            stance_pref = stance_map.get(narrator_preferences.get("stance", ""), stance_pref)

        # Get protagonist for focal character consideration
        protagonist = characters[0] if characters else {}
        protagonist_name = protagonist.get("name", "Unknown")

        # Format the prompt with user preferences
        formatted_prompt = NARRATOR_DESIGN_PROMPT.format(
            pov_preference=pov_pref,
            reliability_preference=reliability_pref,
            stance_preference=stance_pref,
        )

        # Build character summary list outside f-string to avoid set literal issue
        character_summary = [
            {"name": c.get("name"), "archetype": c.get("archetype"), "role": c.get("role", "supporting")}
            for c in characters
        ]
        character_summary_json = json.dumps(character_summary, indent=2)

        user_prompt = f"""
## Story Context

**Seed Idea:** {narrative.get("seed_idea", "")}
**Plot Summary:** {narrative.get("plot_summary", "")}
**Main Conflict:** {narrative.get("main_conflict", "")}
**Thematic Elements:** {_safe_join(narrative.get("thematic_elements", []))}
**Tone:** {narrative.get("tone", "")}
**Target Audience:** {narrative.get("target_audience", "")}

## Protagonist

**Name:** {protagonist_name}
**Archetype:** {protagonist.get("archetype", "")}
**Core Motivation:** {protagonist.get("core_motivation", "")}
**Psychological Wound:** {protagonist.get("psychological_wound", "")}

## All Characters

{character_summary_json}

---

{formatted_prompt}

Design the narrator for this story as valid JSON.
"""

        # Call the architect agent to design the narrator
        # Note: We use Architect agent but emit as "Narrator" for UI visibility
        logger.info("[run_narrator_design] Starting narrator design generation")
        narrator_response = await self._call_agent(self.architect, user_prompt)
        
        # Parse and emit as "Narrator" agent for UI card visibility
        narrator_msg = self._parse_agent_message("Narrator", narrator_response)
        self.state.messages.append(narrator_msg)
        
        # Emit agent message for UI to show Narrator card
        self._emit_agent_message("Narrator", "response", narrator_response)

        # Parse narrator design
        narrator_design = {}
        if isinstance(narrator_msg.content, dict):
            narrator_design = narrator_msg.content
        
        logger.info(f"[run_narrator_design] Narrator design generated: POV={narrator_design.get('pov', {}).get('type', 'unknown')}")

        self._emit_event("phase_complete", {
            "phase": "narrator_design",
            "pov": narrator_design.get("pov", "unknown"),
        })

        return {
            "narrator_design": narrator_design,
            "messages": [
                {"agent": m.from_agent, "type": m.type}
                for m in self.state.messages if m.type in ["question", "response"]
            ],
        }

    # Priority 2: Deepening Checkpoints (Storyteller Section 6.1)
    # =========================================================================

    async def run_deepening_checkpoint(
        self,
        scene_number: int,
        scene_draft: Dict[str, Any],
        checkpoint_type: str,
        narrative: Dict[str, Any],
        characters: List[Dict[str, Any]],
        outline: Dict[str, Any],
        previous_scenes: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Run a deepening checkpoint evaluation for a key structural scene.

        Deepening checkpoints are quality gates at critical narrative points:
        - inciting_incident: Scene that disrupts the protagonist's ordinary world
        - midpoint: Major shift in story direction, stakes escalation
        - climax: Highest tension point, protagonist's defining choice
        - resolution: Emotional closure, arc completion

        Args:
            scene_number: The scene number being evaluated
            scene_draft: The drafted scene content
            checkpoint_type: Type of checkpoint (inciting_incident, midpoint, climax, resolution)
            narrative: Narrative foundation from Genesis phase
            characters: Character profiles from Profiler
            outline: Plot outline from Strategist
            previous_scenes: Optional list of previous scene drafts for context

        Returns:
            Dict with checkpoint evaluation results including pass/fail and feedback
        """
        valid_checkpoints = ["inciting_incident", "midpoint", "climax", "resolution"]
        if checkpoint_type not in valid_checkpoints:
            raise ValueError(f"Invalid checkpoint_type: {checkpoint_type}. Must be one of {valid_checkpoints}")

        self._emit_event("checkpoint_start", {
            "scene_number": scene_number,
            "checkpoint_type": checkpoint_type,
        })

        # Format scene content for evaluation
        scene_content = scene_draft.get("narrative_content", "")
        if isinstance(scene_content, list):
            scene_content = "\n\n".join(scene_content)
        elif isinstance(scene_content, dict):
            scene_content = json.dumps(scene_content, indent=2)

        scene_title = scene_draft.get("scene_title", f"Scene {scene_number}")

        # Format character arcs
        character_arcs = []
        for char in characters:
            arc_info = f"- {char.get('name', 'Unknown')}: {char.get('potential_arc', char.get('arc_type', 'Unknown arc'))}"
            if char.get('psychological_wound'):
                arc_info += f" (wound: {char.get('psychological_wound')})"
            character_arcs.append(arc_info)
        character_arcs_str = "\n".join(character_arcs) if character_arcs else "No character arc information available"

        # Format themes
        themes = narrative.get("thematic_elements", [])
        if isinstance(themes, list):
            themes_str = ", ".join(themes) if themes else "No themes specified"
        else:
            themes_str = str(themes)

        # Format previous events
        previous_events = []
        if previous_scenes:
            for prev_scene in previous_scenes[-3:]:
                prev_title = prev_scene.get("scene_title", "Untitled")
                prev_summary = prev_scene.get("scene_summary", prev_scene.get("plot_advancement", ""))
                if prev_summary:
                    previous_events.append(f"- {prev_title}: {prev_summary[:200]}")
        previous_events_str = "\n".join(previous_events) if previous_events else "This is an early scene with no significant previous events"

        # Format narrative summary
        narrative_summary = f"""
Plot Summary: {narrative.get("plot_summary", "Not available")}
Main Conflict: {narrative.get("main_conflict", "Not available")}
Setting: {narrative.get("setting_description", "Not available")}
"""

        # Build the evaluation prompt
        user_prompt = DEEPENING_CHECKPOINT_PROMPT.format(
            checkpoint_type=checkpoint_type.replace("_", " ").title(),
            scene_number=scene_number,
            scene_title=scene_title,
            scene_content=scene_content[:5000],
            narrative_summary=narrative_summary,
            character_arcs=character_arcs_str,
            themes=themes_str,
            previous_events=previous_events_str,
        )

        # Use the Critic agent for checkpoint evaluation
        response = await self._call_agent(self.critic, user_prompt)
        checkpoint_msg = self._parse_agent_message("Critic", response)
        self.state.messages.append(checkpoint_msg)

        # Parse the checkpoint result
        checkpoint_result = checkpoint_msg.content if isinstance(checkpoint_msg.content, dict) else {}

        # Determine if checkpoint passed
        passed = checkpoint_result.get("passed", False)
        overall_score = checkpoint_result.get("overall_score", 0)

        # Check passing criteria
        criteria_scores = checkpoint_result.get("criteria_scores", {})
        structural_score = criteria_scores.get("structural_function", {}).get("score", 0)
        min_score = min(
            [c.get("score", 10) for c in criteria_scores.values() if isinstance(c, dict)],
            default=10
        )

        # Apply passing threshold logic
        if overall_score >= 7.0 and min_score >= 5 and structural_score >= 7:
            passed = True
        else:
            passed = False

        checkpoint_result["passed"] = passed

        self._emit_event("checkpoint_complete", {
            "scene_number": scene_number,
            "checkpoint_type": checkpoint_type,
            "passed": passed,
            "overall_score": overall_score,
            "structural_score": structural_score,
            "revision_priority": checkpoint_result.get("revision_priority", "medium"),
        })

        return {
            "checkpoint_type": checkpoint_type,
            "scene_number": scene_number,
            "passed": passed,
            "overall_score": overall_score,
            "criteria_scores": criteria_scores,
            "strengths": checkpoint_result.get("strengths", []),
            "areas_for_improvement": checkpoint_result.get("areas_for_improvement", []),
            "checkpoint_specific_notes": checkpoint_result.get("checkpoint_specific_notes", ""),
            "revision_priority": checkpoint_result.get("revision_priority", "medium"),
            "suggested_revisions": checkpoint_result.get("suggested_revisions", []),
        }

    def get_checkpoint_scenes(self, outline: Dict[str, Any]) -> Dict[str, int]:
        """
        Extract the checkpoint scene numbers from the outline.

        Returns:
            Dict mapping checkpoint type to scene number
        """
        return {
            "inciting_incident": outline.get("inciting_incident_scene", 2),
            "midpoint": outline.get("midpoint_scene", outline.get("total_scenes", 10) // 2),
            "climax": outline.get("climax_scene", int(outline.get("total_scenes", 10) * 0.8)),
            "resolution": outline.get("resolution_scene", outline.get("total_scenes", 10)),
        }

    def is_checkpoint_scene(self, scene_number: int, outline: Dict[str, Any]) -> Optional[str]:
        """
        Check if a scene number is a checkpoint scene.

        Args:
            scene_number: The scene number to check
            outline: The plot outline containing checkpoint markers

        Returns:
            The checkpoint type if this is a checkpoint scene, None otherwise
        """
        checkpoint_scenes = self.get_checkpoint_scenes(outline)
        for checkpoint_type, checkpoint_scene in checkpoint_scenes.items():
            if scene_number == checkpoint_scene:
                return checkpoint_type
        return None

    # =========================================================================
    # Priority 1: Symbolic/Motif Layer Planning (Storyteller Section 3.5.2)
    # =========================================================================

    async def run_motif_layer_planning(
        self,
        narrative: Dict[str, Any],
        characters: List[Dict[str, Any]],
        outline: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Generate a comprehensive Symbolic/Motif Layer Plan - a "Motif Bible" for the story.

        This creates the symbolic and motif layer that will run throughout the narrative,
        including visual metaphors, recurring symbols, and per-scene motif targets.

        Args:
            narrative: Narrative foundation from Genesis phase
            characters: Character profiles from Profiler
            outline: Plot outline from Strategist

        Returns:
            Dict containing the motif bible with core symbols, visual metaphor system,
            character motifs, structural motifs, and per-scene motif targets
        """
        self._emit_event("phase_start", {"phase": "motif_layer_planning"})
        self._emit_event("motif_planning_start", {
            "total_scenes": len(outline.get("scenes", [])),
        })

        # Format narrative summary
        narrative_summary = f"""
Plot Summary: {narrative.get("plot_summary", "Not available")}
Main Conflict: {narrative.get("main_conflict", "Not available")}
Setting: {narrative.get("setting_description", "Not available")}
Genre: {narrative.get("genre_approach", "Not specified")}
Tone: {narrative.get("estimated_tone", "Not specified")}
"""

        # Format themes
        themes = narrative.get("thematic_elements", [])
        if isinstance(themes, list):
            themes_str = "\n".join([f"- {t}" for t in themes]) if themes else "No themes specified"
        else:
            themes_str = str(themes)

        # Format characters
        characters_str = ""
        for char in characters:
            char_info = f"""
**{char.get('name', 'Unknown')}** ({char.get('role', 'Unknown role')})
- Arc: {char.get('potential_arc', char.get('arc_type', 'Unknown'))}
- Psychological Wound: {char.get('psychological_wound', 'Not specified')}
- Core Desire: {char.get('core_desire', 'Not specified')}
- Core Fear: {char.get('core_fear', 'Not specified')}
"""
            characters_str += char_info

        # Format outline summary
        scenes = outline.get("scenes", [])
        outline_summary = f"Total Scenes: {len(scenes)}\n\n"
        for scene in scenes:
            scene_num = scene.get("scene_number", "?")
            scene_title = scene.get("title", scene.get("scene_title", "Untitled"))
            scene_purpose = scene.get("purpose", scene.get("scene_purpose", ""))
            outline_summary += f"Scene {scene_num}: {scene_title}\n"
            if scene_purpose:
                outline_summary += f"  Purpose: {scene_purpose[:100]}...\n" if len(scene_purpose) > 100 else f"  Purpose: {scene_purpose}\n"

        # Build the prompt
        user_prompt = SYMBOLIC_MOTIF_LAYER_PROMPT.format(
            narrative_summary=narrative_summary,
            themes=themes_str,
            characters=characters_str,
            outline_summary=outline_summary,
        )

        # Use the Architect agent for motif planning (creative, structural work)
        response = await self._call_agent(self.architect, user_prompt)
        msg = self._parse_agent_message("Architect", response)
        self.state.messages.append(msg)

        narrator_design = msg.content if isinstance(msg.content, dict) else {}

        # Extract key info for the event
        pov_type = narrator_design.get("pov", {}).get("type", "unknown")
        reliability_level = narrator_design.get("reliability", {}).get("level", "unknown")
        stance_primary = narrator_design.get("stance", {}).get("primary", "unknown")

        self._emit_event("phase_complete", {
            "phase": "narrator_design",
            "pov": pov_type,
            "reliability": reliability_level,
            "stance": stance_primary,
        })

        return {
            "narrator_design": narrator_design,
            "pov": pov_type,
            "reliability": reliability_level,
            "stance": stance_primary,
        }

        motif_result = msg.content if isinstance(msg.content, dict) else {}

        # Extract key components for validation
        motif_bible = motif_result.get("motif_bible", {})
        scene_motif_targets = motif_result.get("scene_motif_targets", [])

        # Emit completion event with summary
        self._emit_event("motif_planning_complete", {
            "core_symbols_count": len(motif_bible.get("core_symbols", [])),
            "character_motifs_count": len(motif_bible.get("character_motifs", [])),
            "scene_targets_count": len(scene_motif_targets),
            "has_structural_motifs": bool(motif_bible.get("structural_motifs")),
        })

        self._emit_event("phase_complete", {"phase": "motif_layer_planning"})

        return {
            "motif_bible": motif_bible,
            "scene_motif_targets": scene_motif_targets,
            "motif_tracking": motif_result.get("motif_tracking", {}),
            "integration_guidelines": motif_result.get("integration_guidelines", {}),
        }

    def get_scene_motif_target(
        self,
        scene_number: int,
        motif_layer: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Get the motif target for a specific scene.

        Args:
            scene_number: The scene number to get motif target for
            motif_layer: The full motif layer planning result

        Returns:
            The motif target for the scene, or None if not found
        """
        scene_targets = motif_layer.get("scene_motif_targets", [])
        for target in scene_targets:
            if target.get("scene_number") == scene_number:
                return target
        return None

    # =========================================================================
    # Priority 3: Advanced Features
    # =========================================================================

    async def run_contradiction_maps(
        self,
        characters: List[Dict[str, Any]],
        narrative: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Generate Internal Contradiction Maps for characters.
        Maps contradictory desires, beliefs, and behaviors within each character.

        Args:
            characters: List of character profiles from Profiler
            narrative: Narrative context from Genesis phase
        """
        self._emit_event("phase_start", {"phase": "contradiction_maps"})

        # Format character profiles for analysis
        characters_str = json.dumps(characters, indent=2)

        user_prompt = f"""
## Characters to Analyze

{characters_str}

## Narrative Context

**Plot Summary:** {narrative.get("plot_summary", "")}
**Main Conflict:** {narrative.get("main_conflict", "")}
**Thematic Elements:** {_safe_join(narrative.get("thematic_elements", []))}

---

{CONTRADICTION_MAPS_PROMPT}

Analyze each character and output the contradiction maps as valid JSON.
"""

        response = await self._call_agent(self.profiler, user_prompt)
        msg = self._parse_agent_message("Profiler", response)
        self.state.messages.append(msg)

        contradiction_maps = msg.content if isinstance(msg.content, dict) else {}

        self._emit_event("phase_complete", {
            "phase": "contradiction_maps",
            "character_count": len(characters),
        })

        return {
            "contradiction_maps": contradiction_maps,
            "characters_analyzed": len(characters),
        }

    async def run_emotional_beat_sheet(
        self,
        outline: Dict[str, Any],
        characters: List[Dict[str, Any]],
        narrative: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Generate a comprehensive Emotional Beat Sheet for the entire story.
        Maps emotional trajectory across all scenes.

        Args:
            outline: Plot outline with scenes
            characters: Character profiles
            narrative: Narrative context
        """
        self._emit_event("phase_start", {"phase": "emotional_beat_sheet"})

        scenes = outline.get("scenes", [])
        scenes_summary = "\n".join([
            f"Scene {s.get('scene_number', i+1)}: {s.get('title', 'Untitled')} - {s.get('conflict_description', '')}"
            for i, s in enumerate(scenes)
        ])

        protagonist = characters[0] if characters else {}

        user_prompt = f"""
## Story Structure

**Total Scenes:** {len(scenes)}
**Structure Type:** {outline.get("structure_type", "ThreeAct")}

**Key Structure Points:**
- Inciting Incident: Scene {outline.get("inciting_incident_scene", 1)}
- Midpoint: Scene {outline.get("midpoint_scene", len(scenes)//2)}
- Climax: Scene {outline.get("climax_scene", len(scenes)-1)}
- Resolution: Scene {outline.get("resolution_scene", len(scenes))}

## Scene Overview

{scenes_summary}

## Protagonist

**Name:** {protagonist.get("name", "Unknown")}
**Core Motivation:** {protagonist.get("core_motivation", "")}
**Psychological Wound:** {protagonist.get("psychological_wound", "")}
**Deepest Fear:** {protagonist.get("deepest_fear", "")}

## Narrative Context

**Plot Summary:** {narrative.get("plot_summary", "")}
**Thematic Elements:** {_safe_join(narrative.get("thematic_elements", []))}

---

{EMOTIONAL_BEAT_SHEET_PROMPT}

Create the emotional beat sheet as valid JSON.
"""

        response = await self._call_agent(self.strategist, user_prompt)
        msg = self._parse_agent_message("Strategist", response)
        self.state.messages.append(msg)

        beat_sheet = msg.content if isinstance(msg.content, dict) else {}

        self._emit_event("phase_complete", {
            "phase": "emotional_beat_sheet",
            "scene_count": len(scenes),
        })

        return {
            "emotional_beat_sheet": beat_sheet,
            "scene_count": len(scenes),
        }

    async def run_sensory_blueprint(
        self,
        scene: Dict[str, Any],
        characters: List[Dict[str, Any]],
        worldbuilding: Optional[Dict[str, Any]] = None,
        emotional_beat: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate a Sensory Imagery Blueprint for a specific scene.
        Plans sensory details before drafting.

        Args:
            scene: Scene outline
            characters: Characters present in the scene
            worldbuilding: Worldbuilding context
            emotional_beat: Emotional beat for this scene
        """
        scene_number = scene.get("scene_number", 1)
        self._emit_event("sensory_blueprint_start", {"scene_number": scene_number})

        # Get characters present in this scene
        present_chars = [
            c for c in characters
            if c.get("name") in scene.get("characters_present", [])
        ]

        user_prompt = f"""
## Scene Context

**Scene Number:** {scene_number}
**Scene Title:** {scene.get("title", "Untitled")}
**Setting:** {scene.get("setting", "")}

**Conflict:** {scene.get("conflict_description", "")}

**Emotional Beat:**
- Initial: {_normalize_dict(emotional_beat if emotional_beat else scene.get("emotional_beat"), fallback_key="initial_state").get("initial_state", "")}
- Climax: {_normalize_dict(emotional_beat if emotional_beat else scene.get("emotional_beat"), fallback_key="initial_state").get("climax", "")}
- Final: {_normalize_dict(emotional_beat if emotional_beat else scene.get("emotional_beat"), fallback_key="initial_state").get("final_state", "")}

## Characters Present

{json.dumps(present_chars, indent=2) if present_chars else "No specific characters"}

## Worldbuilding Context

{json.dumps(worldbuilding, indent=2) if worldbuilding else "N/A"}

---

{SENSORY_BLUEPRINT_PROMPT}

Create the sensory blueprint for this scene as valid JSON.
"""

        response = await self._call_agent(self.writer, user_prompt)
        msg = self._parse_agent_message("Writer", response)
        self.state.messages.append(msg)

        blueprint = msg.content if isinstance(msg.content, dict) else {}

        self._emit_event("sensory_blueprint_complete", {
            "scene_number": scene_number,
        })

        return {
            "sensory_blueprint": blueprint,
            "scene_number": scene_number,
        }

    async def run_subtext_design(
        self,
        scene: Dict[str, Any],
        characters: List[Dict[str, Any]],
        contradiction_maps: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Design the Subtext Layer for a scene using the Iceberg Principle.
        Ensures 60%+ of meanings remain implicit.

        Args:
            scene: Scene outline
            characters: Characters in the scene
            contradiction_maps: Character contradiction maps for deeper subtext
        """
        scene_number = scene.get("scene_number", 1)
        self._emit_event("subtext_design_start", {"scene_number": scene_number})

        # Get characters present
        present_chars = [
            c for c in characters
            if c.get("name") in scene.get("characters_present", [])
        ]

        # Get relevant contradictions
        relevant_contradictions = []
        if contradiction_maps and "character_contradictions" in contradiction_maps:
            for char_map in contradiction_maps["character_contradictions"]:
                if char_map.get("character_name") in scene.get("characters_present", []):
                    relevant_contradictions.append(char_map)

        user_prompt = f"""
## Scene Context

**Scene Number:** {scene_number}
**Scene Title:** {scene.get("title", "Untitled")}
**Setting:** {scene.get("setting", "")}

**Conflict:** {scene.get("conflict_description", "")}
**Plot Advancement:** {scene.get("plot_advancement", "")}

**Existing Subtext Layer:** {scene.get("subtext_layer", "")}

## Characters Present

{json.dumps(present_chars, indent=2) if present_chars else "No specific characters"}

## Character Contradictions (for deeper subtext)

{json.dumps(relevant_contradictions, indent=2) if relevant_contradictions else "N/A"}

---

{SUBTEXT_DESIGN_PROMPT}

Design the subtext layer for this scene as valid JSON.
"""

        response = await self._call_agent(self.strategist, user_prompt)
        msg = self._parse_agent_message("Strategist", response)
        self.state.messages.append(msg)

        subtext_design = msg.content if isinstance(msg.content, dict) else {}

        self._emit_event("subtext_design_complete", {
            "scene_number": scene_number,
            "iceberg_ratio": subtext_design.get("iceberg_ratio", {}),
        })

        return {
            "subtext_design": subtext_design,
            "scene_number": scene_number,
        }

    async def run_complexity_checklist(
        self,
        outline: Dict[str, Any],
        characters: List[Dict[str, Any]],
        narrative: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Generate a Complexity Layer Checklist for the story.
        Tracks Main Plot, Subplot, Character Arc, Symbolic, and Thematic layers.

        Args:
            outline: Plot outline with scenes
            characters: Character profiles
            narrative: Narrative context
        """
        self._emit_event("phase_start", {"phase": "complexity_checklist"})

        scenes = outline.get("scenes", [])
        scenes_str = json.dumps(scenes, indent=2)

        user_prompt = f"""
## Story Overview

**Plot Summary:** {narrative.get("plot_summary", "")}
**Main Conflict:** {narrative.get("main_conflict", "")}
**Thematic Elements:** {_safe_join(narrative.get("thematic_elements", []))}

## Characters

{json.dumps([{"name": c.get("name"), "archetype": c.get("archetype"), "potential_arc": c.get("potential_arc")} for c in characters], indent=2)}

## Scene Outline

{scenes_str}

---

{COMPLEXITY_CHECKLIST_PROMPT}

Generate the complexity layer checklist as valid JSON.
"""

        response = await self._call_agent(self.strategist, user_prompt)
        msg = self._parse_agent_message("Strategist", response)
        self.state.messages.append(msg)

        checklist = msg.content if isinstance(msg.content, dict) else {}

        self._emit_event("phase_complete", {
            "phase": "complexity_checklist",
            "layers_tracked": 5,
        })

        return {
            "complexity_checklist": checklist,
            "scene_count": len(scenes),
        }

    async def run_advanced_planning(
        self,
        outline: Dict[str, Any],
        characters: List[Dict[str, Any]],
        narrative: Dict[str, Any],
        worldbuilding: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run all advanced planning phases before drafting.
        This is a convenience method that runs:
        1. Contradiction Maps
        2. Emotional Beat Sheet
        3. Complexity Checklist

        Per-scene planning (Sensory Blueprint, Subtext Design) is done in drafting.

        Args:
            outline: Plot outline with scenes
            characters: Character profiles
            narrative: Narrative context
            worldbuilding: Worldbuilding context
        """
        self._emit_event("phase_start", {"phase": "advanced_planning"})

        results = {}

        # 1. Generate Contradiction Maps for characters
        contradiction_result = await self.run_contradiction_maps(
            characters=characters,
            narrative=narrative,
        )
        results["contradiction_maps"] = contradiction_result.get("contradiction_maps", {})

        # 2. Generate Emotional Beat Sheet
        beat_sheet_result = await self.run_emotional_beat_sheet(
            outline=outline,
            characters=characters,
            narrative=narrative,
        )
        results["emotional_beat_sheet"] = beat_sheet_result.get("emotional_beat_sheet", {})

        # 3. Generate Complexity Checklist
        complexity_result = await self.run_complexity_checklist(
            outline=outline,
            characters=characters,
            narrative=narrative,
        )
        results["complexity_checklist"] = complexity_result.get("complexity_checklist", {})

        self._emit_event("phase_complete", {
            "phase": "advanced_planning",
            "features_completed": ["contradiction_maps", "emotional_beat_sheet", "complexity_checklist"],
        })

        return results

    # =========================================================================
    # Constraint Resolution (Archivist Agent)
    # =========================================================================

    ARCHIVIST_SNAPSHOT_INTERVAL = 5  # Run Archivist every N scenes

    def should_run_archivist(self, current_scene: int) -> bool:
        """Check if Archivist should run based on scene interval.
        
        Args:
            current_scene: Current scene number being processed
            
        Returns:
            True if Archivist should run (enough scenes since last snapshot)
        """
        if not self.state:
            return False
        last_snapshot = self.state.last_archivist_scene
        return current_scene - last_snapshot >= self.ARCHIVIST_SNAPSHOT_INTERVAL

    def add_raw_fact(self, fact: str, scene_number: int, source_agent: str = "writer") -> None:
        """Add a raw fact to the append-only log for later processing by Archivist.
        
        Args:
            fact: The raw fact extracted from scene content
            scene_number: Scene where this fact was established
            source_agent: Agent that produced this fact (writer, critic)
        """
        if not self.state:
            return
        
        from datetime import datetime
        self.state.raw_facts_log.append({
            "fact": fact,
            "scene_number": scene_number,
            "source_agent": source_agent,
            "timestamp": datetime.utcnow().isoformat(),
        })

    CONSTRAINT_RECENCY_WINDOW = 10  # Include constraints accessed in last N scenes

    def get_current_constraints_context(
        self,
        current_scene: int = 0,
        characters_present: Optional[List[str]] = None,
    ) -> str:
        """Get formatted string of relevant key constraints for agent context.
        
        Uses relevance filtering to prevent context pollution:
        1. Always include global constraints (is_global=True)
        2. Include constraints matching characters present (char_{name}_*)
        3. Include constraints accessed in last N scenes (recency fallback)
        4. Always include plot_* constraints
        
        Args:
            current_scene: Current scene number for recency filtering
            characters_present: List of character names in current scene
            
        Returns:
            Formatted string of relevant constraints for inclusion in prompts
        """
        if not self.state or not self.state.key_constraints:
            return "No constraints established yet."
        
        # Normalize character names for prefix matching
        char_prefixes = []
        if characters_present:
            for char_name in characters_present:
                # Normalize: lowercase, replace spaces with underscore
                normalized = char_name.lower().replace(" ", "_").replace("-", "_")
                char_prefixes.append(f"char_{normalized}_")
        
        relevant_constraints = []
        other_constraints = []
        
        for key, constraint in self.state.key_constraints.items():
            is_relevant = False
            
            # 1. Always include global constraints
            if constraint.get("is_global", False):
                is_relevant = True
            
            # 2. Always include plot_* constraints
            elif key.startswith("plot_"):
                is_relevant = True
            
            # 3. Include constraints matching characters present
            elif char_prefixes and any(key.startswith(prefix) for prefix in char_prefixes):
                is_relevant = True
            
            # 4. Include constraints accessed recently (recency fallback)
            elif current_scene > 0:
                last_accessed = constraint.get("last_accessed_at_scene", 0)
                scene_updated = constraint.get("scene_number", 0)
                most_recent = max(last_accessed, scene_updated)
                if current_scene - most_recent <= self.CONSTRAINT_RECENCY_WINDOW:
                    is_relevant = True
            
            if is_relevant:
                relevant_constraints.append((key, constraint))
            else:
                other_constraints.append((key, constraint))
        
        # Update last_accessed_at_scene for included constraints
        for key, constraint in relevant_constraints:
            if current_scene > 0:
                constraint["last_accessed_at_scene"] = current_scene
        
        if not relevant_constraints:
            return "No constraints established yet."
        
        # Format output
        lines = []
        
        # Group by category for readability
        global_lines = []
        char_lines = []
        world_lines = []
        plot_lines = []
        other_lines = []
        
        for key, constraint in relevant_constraints:
            line = f"- {key}: {constraint.get('value')} (scene {constraint.get('scene_number')})"
            if constraint.get("is_global"):
                line += " [GLOBAL]"
            
            if key.startswith("char_"):
                char_lines.append(line)
            elif key.startswith("world_"):
                world_lines.append(line)
            elif key.startswith("plot_"):
                plot_lines.append(line)
            elif key.startswith("rel_"):
                other_lines.append(line)
            else:
                other_lines.append(line)
        
        if plot_lines:
            lines.append("**Plot:**")
            lines.extend(plot_lines)
        if char_lines:
            lines.append("**Characters:**")
            lines.extend(char_lines)
        if world_lines:
            lines.append("**World:**")
            lines.extend(world_lines)
        if other_lines:
            lines.append("**Other:**")
            lines.extend(other_lines)
        
        return "\n".join(lines)

    async def run_archivist_snapshot(
        self,
        current_scene: int,
        characters: List[Dict[str, Any]],
        plot_phase: str = "drafting",
    ) -> Dict[str, Any]:
        """
        Run the Archivist agent to resolve constraints and create a snapshot.
        
        This method:
        1. Collects current constraints and new raw facts
        2. Calls the Archivist agent to resolve conflicts
        3. Updates the canonical constraint state
        4. Clears processed raw facts
        
        Args:
            current_scene: Current scene number
            characters: Character profiles for context
            plot_phase: Current plot phase for context
            
        Returns:
            Dict with archivist results including resolved constraints
        """
        if not self.state:
            return {"error": "No generation state available"}

        self._emit_event("phase_start", {"phase": "archivist_snapshot", "scene": current_scene})

        # Format current constraints
        current_constraints_str = "None" if not self.state.key_constraints else json.dumps(
            [
                {
                    "key": key,
                    "value": c.get("value"),
                    "scene_number": c.get("scene_number"),
                    "category": c.get("category"),
                }
                for key, c in self.state.key_constraints.items()
            ],
            indent=2
        )

        # Format new facts log
        new_facts_str = "None" if not self.state.raw_facts_log else json.dumps(
            self.state.raw_facts_log,
            indent=2
        )

        # Get character names for context
        character_names = ", ".join([c.get("name", "Unknown") for c in characters])

        # Build user prompt
        user_prompt = ARCHIVIST_USER_PROMPT_TEMPLATE.format(
            current_scene=current_scene,
            last_snapshot_scene=self.state.last_archivist_scene,
            current_constraints=current_constraints_str,
            new_facts_log=new_facts_str,
            character_names=character_names,
            plot_phase=plot_phase,
        )

        # Call Archivist agent
        response = await self._call_agent(self.archivist, user_prompt)
        msg = self._parse_agent_message("Archivist", response)
        self.state.messages.append(msg)

        # Process the response
        result = msg.content if isinstance(msg.content, dict) else {}
        
        # Update canonical constraints from Archivist output
        final_constraints = result.get("final_constraints", [])
        if final_constraints:
            # Clear and rebuild key_constraints dict
            new_constraints = {}
            for constraint in final_constraints:
                key = constraint.get("key")
                if key:
                    new_constraints[key] = {
                        "key": key,
                        "value": constraint.get("value"),
                        "scene_number": constraint.get("scene_number", current_scene),
                        "category": constraint.get("category", "plot_point"),
                        "timestamp": datetime.utcnow().isoformat(),
                    }
            self.state.key_constraints = new_constraints

        # Update last snapshot scene
        self.state.last_archivist_scene = current_scene

        # Clear processed raw facts
        processed_count = len(self.state.raw_facts_log)
        self.state.raw_facts_log = []

        self._emit_event("phase_complete", {
            "phase": "archivist_snapshot",
            "scene": current_scene,
            "constraints_count": len(self.state.key_constraints),
            "conflicts_resolved": result.get("conflicts_resolved", 0),
            "facts_discarded": result.get("facts_discarded", 0),
            "facts_processed": processed_count,
        })

        return {
            "archivist_result": result,
            "constraints_count": len(self.state.key_constraints),
            "snapshot_scene": current_scene,
        }

    async def run_demo_generation(
        self,
        project: StoryProject,
        constraints: Optional[Dict[str, Any]] = None,
        narrator_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run a demo generation that involves all 5 agents in a simplified flow.
        This gives users visibility into the multi-agent collaboration without
        the full cost/time of run_full_generation.

        Flow:
        1. Architect: Creates initial narrative concept
        2. Profiler: Suggests character archetypes
        3. Strategist: Proposes story structure
        4. Writer: Drafts opening scene
        5. Critic: Reviews and provides feedback

        Args:
            project: The story project configuration
            constraints: Optional regeneration constraints with:
                - edited_agent: Which agent was edited
                - edited_content: The edited content
                - edit_comment: User's description of what they changed
                - locked_agents: Dict of agent name -> locked content
                - agents_to_regenerate: List of agents to regenerate
            narrator_config: Optional narrator design settings with:
                - pov: Point of view (first_person, third_person_limited, etc.)
                - reliability: Narrator reliability (reliable, unreliable)
                - stance: Narrator stance (objective, judgmental, sympathetic)
        """
        self.state = GenerationState(
            phase=GenerationPhase.GENESIS,
            project_id=project.seed_idea[:20].replace(" ", "_"),
        )

        self._emit_event("phase_start", {"phase": "demo"})

        results = {}

        # Extract constraints if provided
        edited_agent = constraints.get("edited_agent") if constraints else None
        edited_content = constraints.get("edited_content") if constraints else None
        edit_comment = constraints.get("edit_comment") if constraints else None
        locked_agents = constraints.get("locked_agents", {}) if constraints else {}
        agents_to_regenerate = constraints.get("agents_to_regenerate", []) if constraints else []

        # Helper to check if an agent should be skipped (locked or not selected for regen)
        def should_skip_agent(agent_name: str) -> bool:
            if not constraints:
                return False
            # If this is the edited agent, use the edited content
            if agent_name == edited_agent:
                return True
            # If agent is locked, skip it
            if agent_name in locked_agents:
                return True
            # If we have a list of agents to regenerate and this agent is not in it, skip
            if agents_to_regenerate and agent_name not in agents_to_regenerate:
                return True
            return False

        def get_agent_content(agent_name: str) -> Optional[str]:
            """Get the content for a skipped agent."""
            if agent_name == edited_agent:
                return edited_content
            if agent_name in locked_agents:
                return locked_agents[agent_name]
            return None

        # Build constraint context for prompts
        constraint_context = ""
        if constraints and edit_comment:
            constraint_context = f"""
## User Edit Context
The user has made edits to the {edited_agent} agent's output with the following note:
"{edit_comment}"

Please take this feedback into account and ensure your output is consistent with the user's intent.
"""

        # 1. Architect creates narrative concept
        if should_skip_agent("Architect"):
            # Use locked/edited content instead of calling LLM
            architect_content = get_agent_content("Architect")
            self._emit_event("agent_start", {"agent": "Architect", "phase": "demo", "skipped": True})
            self._emit_agent_message("Architect", "locked", architect_content or "")
            self._emit_event("agent_complete", {"agent": "Architect", "skipped": True})
            architect_msg = AgentMessage(type="artifact", from_agent="Architect", content=self._extract_json(architect_content) if architect_content else architect_content)
        else:
            architect_prompt = f"""
## Project Configuration

**Seed Idea:** {project.seed_idea}
**Moral Compass:** {project.moral_compass.value}
**Target Audience:** {project.target_audience}
**Core Themes:** {", ".join(project.theme_core) if project.theme_core else "Not specified"}
{constraint_context}
Create a brief narrative concept including:
- A compelling premise (2-3 sentences)
- The central conflict
- The emotional core of the story
- Key thematic elements

Output as JSON with fields: premise, conflict, emotional_core, themes (array).
"""
            architect_response = await self._call_agent(self.architect, architect_prompt)
            architect_msg = self._parse_agent_message("Architect", architect_response)
        self.state.messages.append(architect_msg)
        results["architect"] = architect_msg.content

        # 2. Profiler suggests character archetypes
        if should_skip_agent("Profiler"):
            profiler_content = get_agent_content("Profiler")
            self._emit_event("agent_start", {"agent": "Profiler", "phase": "demo", "skipped": True})
            self._emit_agent_message("Profiler", "locked", profiler_content or "")
            self._emit_event("agent_complete", {"agent": "Profiler", "skipped": True})
            profiler_msg = AgentMessage(type="artifact", from_agent="Profiler", content=self._extract_json(profiler_content) if profiler_content else profiler_content)
        else:
            profiler_prompt = f"""
Based on this narrative concept:
{json.dumps(architect_msg.content, indent=2) if isinstance(architect_msg.content, dict) else architect_msg.content}
{constraint_context}
Suggest 2-3 main character archetypes that would serve this story well.
For each character, provide:
- Role (protagonist, antagonist, mentor, etc.)
- Core motivation
- Key psychological trait
- Potential arc

Output as JSON with field: characters (array of objects).
"""
            profiler_response = await self._call_agent(self.profiler, profiler_prompt)
            profiler_msg = self._parse_agent_message("Profiler", profiler_response)
        self.state.messages.append(profiler_msg)
        results["profiler"] = profiler_msg.content

        # 3. Strategist proposes story structure
        if should_skip_agent("Strategist"):
            strategist_content = get_agent_content("Strategist")
            self._emit_event("agent_start", {"agent": "Strategist", "phase": "demo", "skipped": True})
            self._emit_agent_message("Strategist", "locked", strategist_content or "")
            self._emit_event("agent_complete", {"agent": "Strategist", "skipped": True})
            strategist_msg = AgentMessage(type="artifact", from_agent="Strategist", content=self._extract_json(strategist_content) if strategist_content else strategist_content)
        else:
            strategist_prompt = f"""
Given this narrative concept and characters:

Concept: {json.dumps(architect_msg.content, indent=2) if isinstance(architect_msg.content, dict) else architect_msg.content}

Characters: {json.dumps(profiler_msg.content, indent=2) if isinstance(profiler_msg.content, dict) else profiler_msg.content}
{constraint_context}
Propose a story structure including:
- Opening hook
- Key turning points (3 major beats)
- Climax setup
- Resolution approach

Output as JSON with fields: opening_hook, turning_points (array), climax, resolution.
"""
            strategist_response = await self._call_agent(self.strategist, strategist_prompt)
            strategist_msg = self._parse_agent_message("Strategist", strategist_response)
        self.state.messages.append(strategist_msg)
        results["strategist"] = strategist_msg.content

        # 4. Writer drafts opening scene
        if should_skip_agent("Writer"):
            writer_content = get_agent_content("Writer")
            self._emit_event("agent_start", {"agent": "Writer", "phase": "demo", "skipped": True})
            self._emit_agent_message("Writer", "locked", writer_content or "")
            self._emit_event("agent_complete", {"agent": "Writer", "skipped": True})
            writer_msg = AgentMessage(type="artifact", from_agent="Writer", content=self._extract_json(writer_content) if writer_content else writer_content)
        else:
            # Format narrator config for demo mode
            narrator_demo_str = ""
            if narrator_config:
                pov_map = {
                    "first_person": "First Person (I/We)",
                    "third_person_limited": "Third Person Limited (He/She)",
                    "third_person_omniscient": "Third Person Omniscient",
                    "second_person": "Second Person (You)",
                }
                reliability_map = {
                    "reliable": "Reliable narrator",
                    "unreliable": "Unreliable narrator",
                }
                stance_map = {
                    "objective": "Objective stance",
                    "judgmental": "Judgmental stance",
                    "sympathetic": "Sympathetic stance",
                }
                narrator_demo_str = f"""
## Narrator Design
- POV: {pov_map.get(narrator_config.get('pov', 'third_person_limited'), 'Third Person Limited')}
- Reliability: {reliability_map.get(narrator_config.get('reliability', 'reliable'), 'Reliable')}
- Stance: {stance_map.get(narrator_config.get('stance', 'objective'), 'Objective')}

IMPORTANT: Write strictly adhering to these narrator settings.
"""
            writer_prompt = f"""
Using the narrative foundation:

Concept: {json.dumps(architect_msg.content, indent=2) if isinstance(architect_msg.content, dict) else architect_msg.content}

Characters: {json.dumps(profiler_msg.content, indent=2) if isinstance(profiler_msg.content, dict) else profiler_msg.content}

Structure: {json.dumps(strategist_msg.content, indent=2) if isinstance(strategist_msg.content, dict) else strategist_msg.content}
{narrator_demo_str}{constraint_context}
Write a compelling opening scene (200-300 words) that:
- Hooks the reader immediately
- Introduces the protagonist
- Establishes the tone and setting
- Hints at the central conflict

Output as JSON with fields: scene_title, setting, narrative_text.
"""
            writer_response = await self._call_agent(self.writer, writer_prompt)
            writer_msg = self._parse_agent_message("Writer", writer_response)
        self.state.messages.append(writer_msg)
        results["writer"] = writer_msg.content

        # 5. Critic reviews everything
        if should_skip_agent("Critic"):
            critic_content = get_agent_content("Critic")
            self._emit_event("agent_start", {"agent": "Critic", "phase": "demo", "skipped": True})
            self._emit_agent_message("Critic", "locked", critic_content or "")
            self._emit_event("agent_complete", {"agent": "Critic", "skipped": True})
            critic_msg = AgentMessage(type="artifact", from_agent="Critic", content=self._extract_json(critic_content) if critic_content else critic_content)
        else:
            critic_prompt = f"""
Review the collaborative output from all agents:

**Architect's Concept:**
{json.dumps(architect_msg.content, indent=2) if isinstance(architect_msg.content, dict) else architect_msg.content}

**Profiler's Characters:**
{json.dumps(profiler_msg.content, indent=2) if isinstance(profiler_msg.content, dict) else profiler_msg.content}

**Strategist's Structure:**
{json.dumps(strategist_msg.content, indent=2) if isinstance(strategist_msg.content, dict) else strategist_msg.content}

**Writer's Opening:**
{json.dumps(writer_msg.content, indent=2) if isinstance(writer_msg.content, dict) else writer_msg.content}
{constraint_context}
Provide a brief assessment:
1. Overall coherence (1-10)
2. Strengths of the collaboration
3. Areas for improvement
4. Final verdict: approved or needs revision

Output as JSON with fields: overall_score, strengths (array), improvements (array), approved (bool), summary.
"""
            critic_response = await self._call_agent(self.critic, critic_prompt)
            critic_msg = self._parse_agent_message("Critic", critic_response)
        self.state.messages.append(critic_msg)
        results["critic"] = critic_msg.content

        self._emit_event("phase_complete", {
            "phase": "demo",
            "result": results,
        })

        return {
            "demo_result": results,
            "messages": [
                {"agent": m.from_agent, "type": m.type, "content": str(m.content)[:500]}
                for m in self.state.messages
            ],
        }

    async def run_full_generation(
        self,
        project: StoryProject,
        target_word_count: int = 50000,
        estimated_scenes: int = 20,
        preferred_structure: str = "ThreeAct",
        openai_api_key: Optional[str] = None,
        max_revisions: int = 2,
        narrator_config: Optional[Dict[str, Any]] = None,
        run_id: Optional[str] = None,
        persistence_service: Optional[SupabasePersistenceService] = None,
        start_from_phase: Optional[str] = None,
        previous_artifacts: Optional[Dict[str, Dict[str, Any]]] = None,
        edited_content: Optional[Dict[str, Any]] = None,
        scenes_to_regenerate: Optional[List[int]] = None,
        previous_run_id: Optional[str] = None,
        change_request: Optional[str] = None,
        supabase_project_id: Optional[str] = None,
        selected_narrative: Optional[Dict[str, Any]] = None,
        research_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run the complete story generation pipeline with optional Qdrant memory integration
        and support for phase-based regeneration and scene-level selective regeneration.

        Args:
            project: Story project configuration
            target_word_count: Target word count for the full story
            estimated_scenes: Estimated number of scenes
            preferred_structure: Story structure (ThreeAct, HeroJourney, etc.)
            openai_api_key: OpenAI API key for embeddings (enables Qdrant memory)
            max_revisions: Maximum Writer↔Critic revision cycles per scene (1-5)
            narrator_config: Narrator design settings (POV, reliability, stance)
            run_id: Unique identifier for this generation run (for artifact persistence)
            persistence_service: Supabase persistence service for storing artifacts
            start_from_phase: Phase to start from (for partial regeneration)
                Options: genesis, characters, worldbuilding, outlining, advanced_planning, drafting, polish
            previous_artifacts: Previously generated artifacts to use when resuming
            edited_content: User-edited content to use instead of regenerating
                Format: {"phase": "characters", "content": {...}}
            scenes_to_regenerate: Optional list of scene numbers to regenerate (1-indexed)
                If provided, only these scenes will be regenerated while keeping others intact
            previous_run_id: Run ID of the previous generation run (for loading existing scenes)
            selected_narrative: Pre-selected narrative possibility from branching UI
                If provided, skips Genesis phase and uses this narrative directly
            research_context: Market research context (prompt_context) to inject into agent prompts
                This is the distilled summary from Eternal Memory research results
        """
        logger.info(f"[run_full_generation] Starting full generation for run_id={run_id}")
        logger.info(f"[run_full_generation] Parameters: target_word_count={target_word_count}, estimated_scenes={estimated_scenes}, preferred_structure={preferred_structure}")
        logger.info(f"[run_full_generation] start_from_phase={start_from_phase}, scenes_to_regenerate={scenes_to_regenerate}")
        logger.info(f"[run_full_generation] selected_narrative provided: {selected_narrative is not None}")
        logger.info(f"[run_full_generation] research_context provided: {research_context is not None}")
        
        results = {
            "project": project.model_dump(),
            "phases": {},
            "memory_enabled": False,
            "run_id": run_id,
            "regeneration_mode": start_from_phase is not None,
            "scene_regeneration_mode": scenes_to_regenerate is not None and len(scenes_to_regenerate) > 0,
            "research_context_applied": research_context is not None,
        }
        
        # Build research context section for prompt injection
        # This is injected into relevant phase prompts to guide content creation
        research_context_section = ""
        if research_context:
            research_context_section = f"""

## MARKET RESEARCH GUIDANCE

The following market research has been conducted for this project. Use these insights to guide your creative decisions:

{research_context}

Apply these insights naturally without explicitly referencing "market research" in the narrative.
"""

        # Phase order for determining what to skip/regenerate
        phase_order = ["genesis", "characters", "worldbuilding", "outlining", "advanced_planning", "drafting", "polish"]
        start_phase_index = 0
        if start_from_phase:
            try:
                start_phase_index = phase_order.index(start_from_phase)
                self._emit_event("regeneration_start", {
                    "start_from_phase": start_from_phase,
                    "phases_to_regenerate": phase_order[start_phase_index:],
                })
            except ValueError:
                self._emit_event("regeneration_error", {"error": f"Unknown phase: {start_from_phase}"})
                start_phase_index = 0

        # Scene-level regeneration mode
        scene_regen_mode = scenes_to_regenerate is not None and len(scenes_to_regenerate) > 0

        # Use change_request parameter if provided (from constraints.edit_comment)
        # Otherwise, try to extract from edited_content (the "What did you change?" field)
        # This will be passed to all regenerated phases as additional AI context
        effective_change_request: Optional[str] = change_request
        if not effective_change_request and edited_content:
            # Check each phase for a comment field
            for phase_name in ["genesis", "characters", "worldbuilding", "outlining", "drafting", "polish"]:
                if phase_name in edited_content:
                    phase_data = edited_content[phase_name]
                    if isinstance(phase_data, dict) and phase_data.get("comment"):
                        effective_change_request = phase_data["comment"]
                        break

        # Limit change_request length to prevent prompt bloat
        if effective_change_request:
            if len(effective_change_request) > 2000:
                effective_change_request = effective_change_request[:2000] + "..."

        # Use effective_change_request for all downstream phases
        change_request = effective_change_request
        if scene_regen_mode:
            if not previous_artifacts:
                self._emit_event("scene_regeneration_error", {
                    "error": "Scene-level regeneration requires previous run artifacts. Please ensure the previous run completed successfully.",
                    "scenes_to_regenerate": scenes_to_regenerate,
                })
                return {"error": "Scene-level regeneration requires previous run artifacts", **results}
            self._emit_event("scene_regeneration_start", {
                "scenes_to_regenerate": scenes_to_regenerate,
            })

        # Generate a unique project ID for memory storage (Qdrant)
        memory_project_id = project.seed_idea[:20].replace(" ", "_") + "_" + str(hash(project.seed_idea))[:8]

        # Use Supabase project UUID for persistence if provided, otherwise fall back to memory_project_id
        # Note: Supabase persistence requires a valid UUID that exists in the projects table
        persistence_project_id = supabase_project_id if supabase_project_id else memory_project_id

        # Initialize state early so it's available for all phases (including skipped ones)
        # This is needed because _call_agent accesses self.state.phase
        self.state = GenerationState(
            phase=GenerationPhase.GENESIS,
            project_id=memory_project_id,  # Use memory_project_id for state (used by Qdrant)
            messages=[],
            current_scene=0,
            max_revisions=max_revisions,
        )

        # Initialize Qdrant memory if API key provided
        if openai_api_key:
            memory_initialized = await self.initialize_memory(openai_api_key)
            results["memory_enabled"] = memory_initialized

        # Helper function to store artifact in Supabase
        async def store_artifact(phase: str, artifact_type: str, content: Dict[str, Any]) -> None:
            if persistence_service and run_id and persistence_service.is_connected and supabase_project_id:
                await persistence_service.store_run_artifact(
                    project_id=persistence_project_id,
                    run_id=run_id,
                    phase=phase,
                    artifact_type=artifact_type,
                    content=content,
                )

        # Helper function to store phase status for resume capability
        async def store_phase_status(
            phase: str,
            status: str,
            error: Optional[str] = None,
            error_type: Optional[str] = None,
        ) -> None:
            """Store phase status artifact for tracking progress and enabling resume.
            
            Args:
                phase: Phase name (genesis, characters, worldbuilding, etc.)
                status: Status string - "started", "completed", or "failed"
                error: Error message if status is "failed"
                error_type: Type of error (retryable, non_retryable)
            """
            if persistence_service and run_id and persistence_service.is_connected and supabase_project_id:
                status_content = {
                    "status": status,
                    "timestamp": datetime.utcnow().isoformat(),
                }
                if error:
                    status_content["error"] = error
                if error_type:
                    status_content["error_type"] = error_type
                await persistence_service.store_run_artifact(
                    project_id=persistence_project_id,
                    run_id=run_id,
                    phase=phase,
                    artifact_type="phase_status",
                    content=status_content,
                )
                logger.info(f"[run_full_generation] Phase '{phase}' status: {status}")

        # Helper function to store individual scene artifact
        async def store_scene(scene_number: int, draft: Dict[str, Any], polished: Optional[Dict[str, Any]] = None) -> None:
            if persistence_service and run_id and persistence_service.is_connected and supabase_project_id:
                await persistence_service.store_scene_artifact(
                    project_id=persistence_project_id,
                    run_id=run_id,
                    scene_number=scene_number,
                    draft=draft,
                    polished=polished,
                )

        # Helper function to get existing scene from previous run
        async def get_existing_scene(scene_number: int) -> Optional[Dict[str, Any]]:
            if persistence_service and previous_run_id and persistence_service.is_connected:
                return await persistence_service.get_scene_artifact(previous_run_id, scene_number)
            return None

        # Helper function to check if we should skip a phase (use previous artifacts)
        def should_skip_phase(phase: str) -> bool:
            if not start_from_phase:
                return False
            phase_index = phase_order.index(phase)
            # Skip phases before start_from_phase, even if previous_artifacts is None
            # This ensures scene-level regeneration doesn't regenerate earlier phases
            return phase_index < start_phase_index

        # Helper function to get previous artifact or edited content
        def get_previous_artifact(phase: str, artifact_type: str) -> Optional[Dict[str, Any]]:
            # Check if user provided edited content for this phase
            # Frontend sends: {"genesis": {"content": "...", "comment": "..."}}
            # or legacy format: {"phase": "genesis", "content": {...}}
            if edited_content:
                if phase in edited_content:
                    phase_content = edited_content[phase]
                    if isinstance(phase_content, dict) and "content" in phase_content:
                        return phase_content.get("content")
                    return phase_content
                elif edited_content.get("phase") == phase:
                    return edited_content.get("content")
            # Otherwise use previous artifacts
            if previous_artifacts and phase in previous_artifacts:
                return previous_artifacts[phase].get(artifact_type)
            return None

        # Phase 1: Genesis
        genesis_result = None

        # Check if user provided a pre-selected narrative from branching UI
        if selected_narrative:
            # User selected a narrative from the branching possibilities
            genesis_result = await self.run_genesis_with_selection(project, selected_narrative)
            await store_artifact("genesis", "narrative_possibility", genesis_result.get("narrative_possibility", {}))
            # Also store the selected narrative ID for reference
            if "id" in selected_narrative:
                await store_artifact("genesis", "selected_narrative_id", {"id": selected_narrative["id"]})
        elif should_skip_phase("genesis"):
            # Use previous genesis result
            narrative = get_previous_artifact("genesis", "narrative_possibility")
            if narrative:
                # Parse the narrative if it's a string (JSON)
                if isinstance(narrative, str):
                    try:
                        narrative = self._extract_json(narrative)
                    except Exception:
                        pass
                genesis_result = {"narrative_possibility": narrative}
                results["phases"]["genesis"] = genesis_result
                self._emit_event("phase_skipped", {"phase": "genesis", "reason": "using_previous_artifact"})
        elif edited_content and "genesis" in edited_content and not change_request:
            # User provided edited content for this phase - use it directly
            # BUT only if there's no change_request - if user wrote "What did you change?", regenerate instead
            edited = get_previous_artifact("genesis", "narrative_possibility")
            if edited:
                # Parse the edited content if it's a string (JSON)
                if isinstance(edited, str):
                    try:
                        edited = self._extract_json(edited)
                    except Exception:
                        pass
                genesis_result = {"narrative_possibility": edited}
                results["phases"]["genesis"] = genesis_result
                self._emit_event("phase_overridden", {"phase": "genesis", "reason": "user_edited_content"})
                # Emit agent message with the edited content
                self._emit_agent_message("Architect", "locked", json.dumps(edited) if isinstance(edited, dict) else str(edited))

        if not genesis_result:
            await self._check_pause()  # Pause checkpoint
            await store_phase_status("genesis", "started")
            try:
                # If research context is provided, create a modified project with enriched target_audience
                if research_context_section:
                    # Create a copy of the project with research context appended to target_audience
                    enriched_project = StoryProject(
                        seed_idea=project.seed_idea,
                        moral_compass=project.moral_compass,
                        target_audience=f"{project.target_audience}\n{research_context_section}" if project.target_audience else research_context_section,
                        theme_core=project.theme_core,
                        tone_style_references=project.tone_style_references,
                        custom_moral_system=project.custom_moral_system,
                    )
                    genesis_result = await self.run_genesis_phase(enriched_project)
                else:
                    genesis_result = await self.run_genesis_phase(project)
                await store_artifact("genesis", "narrative_possibility", genesis_result.get("narrative_possibility", {}))
                await store_phase_status("genesis", "completed")
            except Exception as e:
                error_type = "retryable" if self._is_retryable_error(e) else "non_retryable"
                await store_phase_status("genesis", "failed", error=str(e), error_type=error_type)
                raise

        # Set max_revisions in state AFTER genesis phase creates it
        if self.state:
            self.state.max_revisions = max_revisions
        results["phases"]["genesis"] = genesis_result

        if not genesis_result.get("narrative_possibility"):
            await store_phase_status("genesis", "failed", error="No narrative_possibility returned")
            return {"error": "Genesis phase failed", **results}

        # Phase 2: Characters
        characters_result = None
        if should_skip_phase("characters"):
            characters = get_previous_artifact("characters", "characters")
            if characters:
                characters_result = {"characters": characters}
                results["phases"]["characters"] = characters_result
                self._emit_event("phase_skipped", {"phase": "characters", "reason": "using_previous_artifact"})
        elif edited_content and "characters" in edited_content and not change_request:
            # User provided edited content for this phase - use it directly
            # BUT only if there's no change_request - if user wrote "What did you change?", regenerate instead
            edited = get_previous_artifact("characters", "characters")
            if edited:
                if isinstance(edited, str):
                    try:
                        edited = self._extract_json(edited)
                    except Exception:
                        pass
                characters_result = {"characters": edited.get("characters", edited) if isinstance(edited, dict) else edited}
                results["phases"]["characters"] = characters_result
                self._emit_event("phase_overridden", {"phase": "characters", "reason": "user_edited_content"})
                self._emit_agent_message("Profiler", "locked", json.dumps(edited) if isinstance(edited, dict) else str(edited))

        if not characters_result:
            await self._check_pause()  # Pause checkpoint
            await store_phase_status("characters", "started")
            try:
                characters_result = await self.run_characters_phase(
                    narrative=genesis_result["narrative_possibility"],
                    moral_compass=project.moral_compass.value,
                    target_audience=project.target_audience,
                    change_request=change_request,
                )
                await store_artifact("characters", "characters", {"characters": characters_result.get("characters", [])})
                await store_phase_status("characters", "completed")
            except Exception as e:
                error_type = "retryable" if self._is_retryable_error(e) else "non_retryable"
                await store_phase_status("characters", "failed", error=str(e), error_type=error_type)
                raise

        results["phases"]["characters"] = characters_result

        if not characters_result.get("characters"):
            return {"error": "Characters phase failed", **results}

        # Store characters in Qdrant memory for later retrieval
        characters = characters_result.get("characters", [])
        if isinstance(characters, list):
            await self._store_characters_in_memory(memory_project_id, characters)

        # Phase 2.5: Narrator Design (generates comprehensive narrator artifact)
        # This runs after characters because it needs character context
        narrator_design_result = None
        narrator_design = None
        if should_skip_phase("characters"):
            # If characters phase was skipped, narrator design was also generated previously
            narrator_design = get_previous_artifact("narrator_design", "narrator_design")
            if narrator_design:
                narrator_design_result = {"narrator_design": narrator_design}
                results["phases"]["narrator_design"] = narrator_design_result
                self._emit_event("phase_skipped", {"phase": "narrator_design", "reason": "using_previous_artifact"})

        if not narrator_design_result:
            await self._check_pause()  # Pause checkpoint
            narrator_design_result = await self.run_narrator_design(
                narrative=genesis_result["narrative_possibility"],
                characters=characters_result["characters"],
                narrator_preferences=narrator_config,
            )
            narrator_design = narrator_design_result.get("narrator_design", {})
            await store_artifact("narrator_design", "narrator_design", narrator_design)

        results["phases"]["narrator_design"] = narrator_design_result

        # Phase 3: Worldbuilding
        worldbuilding_result = None
        if should_skip_phase("worldbuilding"):
            worldbuilding = get_previous_artifact("worldbuilding", "worldbuilding")
            if worldbuilding:
                worldbuilding_result = {"worldbuilding": worldbuilding}
                results["phases"]["worldbuilding"] = worldbuilding_result
                self._emit_event("phase_skipped", {"phase": "worldbuilding", "reason": "using_previous_artifact"})
        elif edited_content and "worldbuilding" in edited_content:
            # User provided edited content for this phase - use it directly
            edited = get_previous_artifact("worldbuilding", "worldbuilding")
            if edited:
                if isinstance(edited, str):
                    try:
                        edited = self._extract_json(edited)
                    except Exception:
                        pass
                worldbuilding_result = {"worldbuilding": edited.get("worldbuilding", edited) if isinstance(edited, dict) else edited}
                results["phases"]["worldbuilding"] = worldbuilding_result
                self._emit_event("phase_overridden", {"phase": "worldbuilding", "reason": "user_edited_content"})
                self._emit_agent_message("Worldbuilder", "locked", json.dumps(edited) if isinstance(edited, dict) else str(edited))

        if not worldbuilding_result:
            await self._check_pause()  # Pause checkpoint
            worldbuilding_result = await self.run_worldbuilding_phase(
                narrative=genesis_result["narrative_possibility"],
                characters=characters_result["characters"],
                moral_compass=project.moral_compass.value,
                target_audience=project.target_audience,
                change_request=change_request,
            )
            await store_artifact("worldbuilding", "worldbuilding", worldbuilding_result.get("worldbuilding", {}))

        results["phases"]["worldbuilding"] = worldbuilding_result

        # Worldbuilding is optional - continue even if it fails
        worldbuilding = worldbuilding_result.get("worldbuilding", {})

        # Phase 4: Outlining
        outlining_result = None
        if should_skip_phase("outlining"):
            outline = get_previous_artifact("outlining", "outline")
            if outline:
                outlining_result = {"outline": outline}
                results["phases"]["outlining"] = outlining_result
                self._emit_event("phase_skipped", {"phase": "outlining", "reason": "using_previous_artifact"})
        elif edited_content and "outlining" in edited_content:
            # User provided edited content for this phase - use it directly
            edited = get_previous_artifact("outlining", "outline")
            if edited:
                if isinstance(edited, str):
                    try:
                        edited = self._extract_json(edited)
                    except Exception:
                        pass
                outlining_result = {"outline": edited.get("outline", edited) if isinstance(edited, dict) else edited}
                results["phases"]["outlining"] = outlining_result
                self._emit_event("phase_overridden", {"phase": "outlining", "reason": "user_edited_content"})
                self._emit_agent_message("Strategist", "locked", json.dumps(edited) if isinstance(edited, dict) else str(edited))

        if not outlining_result:
            await self._check_pause()  # Pause checkpoint
            await store_phase_status("outlining", "started")
            try:
                outlining_result = await self.run_outlining_phase(
                    narrative=genesis_result["narrative_possibility"],
                    characters=characters_result["characters"],
                    moral_compass=project.moral_compass.value,
                    target_word_count=target_word_count,
                    estimated_scenes=estimated_scenes,
                    preferred_structure=preferred_structure,
                    worldbuilding=worldbuilding,
                    change_request=change_request,
                )
                await store_artifact("outlining", "outline", outlining_result.get("outline", {}))
                await store_phase_status("outlining", "completed")
            except Exception as e:
                error_type = "retryable" if self._is_retryable_error(e) else "non_retryable"
                await store_phase_status("outlining", "failed", error=str(e), error_type=error_type)
                raise

        results["phases"]["outlining"] = outlining_result

        if not outlining_result.get("outline"):
            logger.error("[run_full_generation] Outlining phase failed - no outline returned")
            await store_phase_status("outlining", "failed", error="No outline returned")
            return {"error": "Outlining phase failed", **results}

        outline = outlining_result["outline"]
        scenes = outline.get("scenes", [])
        logger.info(f"[run_full_generation] Outlining complete. Outline keys: {list(outline.keys()) if isinstance(outline, dict) else 'not a dict'}")
        logger.info(f"[run_full_generation] Number of scenes extracted: {len(scenes)}")
        if scenes:
            logger.info(f"[run_full_generation] First scene: {scenes[0].get('title', 'no title') if isinstance(scenes[0], dict) else scenes[0]}")

        # Phase 4.5: Motif Layer Planning (Symbolic/Motif Bible)
        motif_layer_result = None
        if should_skip_phase("advanced_planning"):
            # Motif layer is part of advanced planning, so skip if advanced planning is skipped
            motif_layer = get_previous_artifact("motif_layer", "motif_bible")
            if motif_layer:
                motif_layer_result = motif_layer
                results["phases"]["motif_layer"] = motif_layer_result
                self._emit_event("phase_skipped", {"phase": "motif_layer", "reason": "using_previous_artifact"})

        if not motif_layer_result:
            await self._check_pause()  # Pause checkpoint
            motif_layer_result = await self.run_motif_layer_planning(
                narrative=genesis_result["narrative_possibility"],
                characters=characters_result["characters"],
                outline=outline,
            )
            await store_artifact("motif_layer", "motif_bible", motif_layer_result)

        results["phases"]["motif_layer"] = motif_layer_result

        # Phase 5: Advanced Planning
        advanced_planning_result = None
        if should_skip_phase("advanced_planning"):
            advanced = get_previous_artifact("advanced_planning", "advanced_planning")
            if advanced:
                advanced_planning_result = advanced
                results["phases"]["advanced_planning"] = advanced_planning_result
                self._emit_event("phase_skipped", {"phase": "advanced_planning", "reason": "using_previous_artifact"})

        if not advanced_planning_result:
            await self._check_pause()  # Pause checkpoint
            advanced_planning_result = await self.run_advanced_planning(
                outline=outline,
                characters=characters_result["characters"],
                narrative=genesis_result["narrative_possibility"],
                worldbuilding=worldbuilding,
            )
            await store_artifact("advanced_planning", "advanced_planning", advanced_planning_result)

        results["phases"]["advanced_planning"] = advanced_planning_result

        # Extract advanced planning artifacts for use in drafting
        contradiction_maps = advanced_planning_result.get("contradiction_maps", {})
        emotional_beat_sheet = advanced_planning_result.get("emotional_beat_sheet", {})
        complexity_checklist = advanced_planning_result.get("complexity_checklist", {})

        # Phase 6: Drafting (all scenes or selective regeneration)
        logger.info(f"[run_full_generation] === ENTERING DRAFTING PHASE ===")
        logger.info(f"[run_full_generation] Total scenes to draft: {len(scenes)}")
        logger.info(f"[run_full_generation] should_skip_phase('drafting'): {should_skip_phase('drafting')}")
        logger.info(f"[run_full_generation] scene_regen_mode: {scene_regen_mode}")
        
        drafts = []
        previous_drafts = None

        # Get previous drafts for scene-level regeneration or phase skip
        if should_skip_phase("drafting") or scene_regen_mode:
            previous_drafts = get_previous_artifact("drafting", "drafts")
            logger.info(f"[run_full_generation] previous_drafts loaded: {previous_drafts is not None}")
            if previous_drafts and should_skip_phase("drafting") and not scene_regen_mode:
                drafts = previous_drafts.get("scenes", [])
                results["phases"]["drafting"] = {"scenes": drafts}
                self._emit_event("phase_skipped", {"phase": "drafting", "reason": "using_previous_artifact"})
                logger.info(f"[run_full_generation] Drafting phase SKIPPED - using previous artifact")

        # Helper to get continuity context from adjacent scenes
        def get_continuity_context(scene_index: int, all_drafts: List[Dict[str, Any]]) -> Dict[str, str]:
            context = {"previous_scene_summary": "N/A", "next_scene_summary": "N/A"}

            # Get previous scene summary
            if scene_index > 0 and scene_index - 1 < len(all_drafts):
                prev_draft = all_drafts[scene_index - 1]
                if prev_draft and prev_draft.get("draft"):
                    prev_content = prev_draft["draft"].get("narrative_content", "")
                    context["previous_scene_summary"] = prev_content[:500] + "..." if prev_content else "N/A"

            # Get next scene summary (for continuity with existing scenes)
            if scene_index + 1 < len(all_drafts):
                next_draft = all_drafts[scene_index + 1]
                if next_draft and next_draft.get("draft"):
                    next_content = next_draft["draft"].get("narrative_content", "")
                    context["next_scene_summary"] = next_content[:500] + "..." if next_content else "N/A"

            return context

        drafting_condition = not (should_skip_phase("drafting") and not scene_regen_mode)
        logger.info(f"[run_full_generation] Will enter drafting loop: {drafting_condition}")
        logger.info(f"[run_full_generation] Condition breakdown: should_skip_phase('drafting')={should_skip_phase('drafting')}, scene_regen_mode={scene_regen_mode}")
        
        if drafting_condition:
            logger.info(f"[run_full_generation] === STARTING DRAFTING LOOP for {len(scenes)} scenes ===")
            # Initialize drafts list with previous drafts if in scene regen mode
            if scene_regen_mode and previous_drafts:
                drafts = previous_drafts.get("scenes", [])
                # Ensure drafts list is long enough for all scenes
                while len(drafts) < len(scenes):
                    drafts.append({})

            previous_summary = "N/A"
            for i, scene in enumerate(scenes):
                scene_number = i + 1
                logger.info(f"[run_full_generation] Processing scene {scene_number}/{len(scenes)}: {scene.get('title', 'untitled')}")

                # Check if this scene should be regenerated or kept
                if scene_regen_mode and scenes_to_regenerate and scene_number not in scenes_to_regenerate:
                    # Keep existing scene, just update previous_summary for continuity
                    if i < len(drafts) and drafts[i].get("draft"):
                        self._emit_event("scene_skipped", {
                            "scene_number": scene_number,
                            "reason": "not_in_regeneration_list"
                        })
                        draft = drafts[i]["draft"]
                        previous_summary = draft.get("narrative_content", "")[:500] + "..."
                        # Store individual scene artifact
                        await store_scene(scene_number, draft, drafts[i].get("polished"))
                    continue

                await self._check_pause()  # Pause checkpoint before each scene

                # Get continuity context from adjacent scenes
                continuity = get_continuity_context(i, drafts)

                # Retrieve relevant characters from memory for this scene
                scene_context = scene.get("title", "") + " " + scene.get("conflict", "")
                relevant_characters = await self._retrieve_relevant_characters(memory_project_id, scene_context, limit=3)

                # Retrieve relevant previous scenes for continuity
                relevant_scenes = await self._retrieve_relevant_scenes(memory_project_id, scene_context, limit=2)

                # Retrieve relevant worldbuilding elements for this scene
                relevant_worldbuilding = await self._retrieve_worldbuilding(memory_project_id, scene_context, limit=3)

                # Merge static worldbuilding with retrieved elements
                scene_worldbuilding = worldbuilding.copy() if worldbuilding else {}
                if relevant_worldbuilding:
                    # Add retrieved elements to the worldbuilding context
                    for key in ["geography", "cultures", "rules", "history"]:
                        if relevant_worldbuilding.get(key):
                            existing = scene_worldbuilding.get(key, [])
                            scene_worldbuilding[key] = existing + [
                                elem for elem in relevant_worldbuilding[key]
                                if elem not in existing
                            ]

                # Build memory context with continuity information
                memory_ctx = {}
                if relevant_characters:
                    memory_ctx["relevant_characters"] = relevant_characters
                if relevant_scenes:
                    memory_ctx["relevant_scenes"] = relevant_scenes

                # Add next scene context for continuity in selective regeneration
                if scene_regen_mode and continuity["next_scene_summary"] != "N/A":
                    memory_ctx["next_scene_context"] = continuity["next_scene_summary"]

                # Get per-scene motif target from the motif layer planning
                scene_motif_target = None
                if motif_layer_result:
                    scene_motif_target = self.get_scene_motif_target(scene_number, motif_layer_result)

                # Generate per-scene Sensory Blueprint
                # This plans specific sensory details before drafting for richer prose
                emotional_beat = _normalize_dict(scene.get("emotional_beat"), fallback_key="initial_state")
                # Try to get emotional beat from the emotional_beat_sheet if available
                if emotional_beat_sheet and emotional_beat_sheet.get("scene_beats"):
                    scene_beats = emotional_beat_sheet.get("scene_beats", [])
                    for beat in scene_beats:
                        if beat.get("scene_number") == scene_number:
                            emotional_beat = beat
                            break

                sensory_blueprint_result = await self.run_sensory_blueprint(
                    scene=scene,
                    characters=characters_result["characters"],
                    worldbuilding=scene_worldbuilding if scene_worldbuilding else None,
                    emotional_beat=emotional_beat,
                )
                scene_sensory_blueprint = sensory_blueprint_result.get("sensory_blueprint", {})

                # Generate per-scene Subtext Design
                # This designs the subtext layer using the Iceberg Principle (60% implicit)
                subtext_design_result = await self.run_subtext_design(
                    scene=scene,
                    characters=characters_result["characters"],
                    contradiction_maps=contradiction_maps if contradiction_maps else None,
                )
                scene_subtext_design = subtext_design_result.get("subtext_design", {})

                draft_result = await self.run_drafting_phase(
                    scene=scene,
                    characters=characters_result["characters"],
                    moral_compass=project.moral_compass.value,
                    worldbuilding=scene_worldbuilding if scene_worldbuilding else None,
                    previous_scene_summary=continuity["previous_scene_summary"] if scene_regen_mode else previous_summary,
                    memory_context=memory_ctx if memory_ctx else None,
                    narrator_config=narrator_config,
                    narrator_design=narrator_design,
                    change_request=change_request,
                    sensory_blueprint=scene_sensory_blueprint,
                    subtext_design=scene_subtext_design,
                    motif_target=scene_motif_target,
                )

                # Quality Gate with retry logic (per scene)
                quality_enforcement_result = None
                if draft_result.get("draft"):
                    emotional_beat = _normalize_dict(scene.get("emotional_beat"), fallback_key="initial_state")
                    quality_enforcement_result = await self.enforce_quality_for_scene(
                        scene_number=scene_number,
                        draft=draft_result["draft"],
                        characters=characters_result["characters"],
                        moral_compass=project.moral_compass.value,
                        target_audience=project.target_audience,
                        emotional_beat=emotional_beat,
                        critique=draft_result.get("critique"),
                        max_quality_retries=2,
                        scene_context=scene_context,
                    )
                    # Update draft_result with the final (possibly revised) draft
                    draft_result["draft"] = quality_enforcement_result["final_draft"]
                    draft_result["quality_enforcement"] = quality_enforcement_result

                # Deepening Checkpoint evaluation for key structural scenes
                checkpoint_type = self.is_checkpoint_scene(scene_number, outline)
                if checkpoint_type and draft_result.get("draft"):
                    # Collect previous scene drafts for context
                    previous_scene_drafts = [
                        d.get("draft", {}) for d in drafts[:i] if d.get("draft")
                    ]
                    checkpoint_result = await self.run_deepening_checkpoint(
                        scene_number=scene_number,
                        scene_draft=draft_result["draft"],
                        checkpoint_type=checkpoint_type,
                        narrative=genesis_result["narrative_possibility"],
                        characters=characters_result["characters"],
                        outline=outline,
                        previous_scenes=previous_scene_drafts,
                    )
                    draft_result["checkpoint"] = checkpoint_result

                    # Store checkpoint result as artifact
                    if persistence_service and run_id and persistence_service.is_connected:
                        await persistence_service.store_run_artifact(
                            project_id=supabase_project_id,
                            run_id=run_id,
                            phase=f"checkpoint_{checkpoint_type}",
                            artifact_type="checkpoint_evaluation",
                            content=checkpoint_result,
                        )

                # Update or append draft result
                if scene_regen_mode and i < len(drafts):
                    drafts[i] = draft_result
                else:
                    drafts.append(draft_result)

                # Store individual scene artifact
                if draft_result.get("draft"):
                    await store_scene(scene_number, draft_result["draft"])

                # Store final draft (after quality revisions) in memory for continuity
                if draft_result.get("draft"):
                    draft = draft_result["draft"]
                    await self._store_scene_in_memory(memory_project_id, scene_number, draft)
                    previous_summary = draft.get("narrative_content", "")[:500] + "..."

                # Run Archivist snapshot if enough scenes have accumulated
                # This resolves contradictory constraints and maintains narrative consistency
                if self.should_run_archivist(scene_number):
                    logger.info(f"[run_full_generation] Running Archivist snapshot at scene {scene_number}")
                    archivist_result = await self.run_archivist_snapshot(
                        current_scene=scene_number,
                        characters=characters_result["characters"],
                        plot_phase="drafting",
                    )
                    # Store archivist snapshot as artifact
                    if persistence_service and run_id and persistence_service.is_connected:
                        await persistence_service.store_run_artifact(
                            project_id=supabase_project_id,
                            run_id=run_id,
                            phase=f"archivist_snapshot_{scene_number}",
                            artifact_type="constraint_snapshot",
                            content=archivist_result,
                        )
                    logger.info(f"[run_full_generation] Archivist resolved {archivist_result.get('constraints_count', 0)} constraints")

            # Store all drafts as a single artifact (for backward compatibility)
            await store_artifact("drafting", "drafts", {"scenes": drafts})

        results["phases"]["drafting"] = {"scenes": drafts}

        # Collect quality gate results from drafts
        quality_results = [
            d.get("quality_enforcement", {}).get("quality_result", {})
            for d in drafts if d.get("quality_enforcement")
        ]
        results["phases"]["quality_gate"] = {"scenes": quality_results}

        # Collect deepening checkpoint results from drafts
        checkpoint_results = {
            d.get("checkpoint", {}).get("checkpoint_type"): d.get("checkpoint", {})
            for d in drafts if d.get("checkpoint")
        }
        if checkpoint_results:
            results["phases"]["checkpoints"] = checkpoint_results

        # Phase 7: Polish (all scenes or selective regeneration)
        polished_drafts = []
        previous_polish = None

        # Get previous polish for scene-level regeneration or phase skip
        if should_skip_phase("polish") or scene_regen_mode:
            previous_polish = get_previous_artifact("polish", "polished")
            if previous_polish and should_skip_phase("polish") and not scene_regen_mode:
                polished_drafts = previous_polish.get("scenes", [])
                results["phases"]["polish"] = {"scenes": polished_drafts}
                self._emit_event("phase_skipped", {"phase": "polish", "reason": "using_previous_artifact"})

        if not (should_skip_phase("polish") and not scene_regen_mode):
            # Initialize polished_drafts with previous polish if in scene regen mode
            if scene_regen_mode and previous_polish:
                polished_drafts = previous_polish.get("scenes", [])
                # Ensure polished_drafts list is long enough for all scenes
                while len(polished_drafts) < len(drafts):
                    polished_drafts.append({})

            for i, draft_result in enumerate(drafts):
                scene_number = i + 1

                # Check if this scene should be polished or kept
                if scene_regen_mode and scenes_to_regenerate and scene_number not in scenes_to_regenerate:
                    # Keep existing polished scene
                    if i < len(polished_drafts) and polished_drafts[i]:
                        self._emit_event("polish_skipped", {
                            "scene_number": scene_number,
                            "reason": "not_in_regeneration_list"
                        })
                    continue

                await self._check_pause()  # Pause checkpoint before each polish
                if draft_result.get("draft"):
                    polish_result = await self.run_polish_phase(
                        scene_number=scene_number,
                        draft=draft_result["draft"],
                        characters=characters_result["characters"],
                        moral_compass=project.moral_compass.value,
                        critique=draft_result.get("critique"),
                        change_request=change_request,
                    )

                    # Update or append polish result
                    if scene_regen_mode and i < len(polished_drafts):
                        polished_drafts[i] = polish_result
                    else:
                        polished_drafts.append(polish_result)

                    # Update scene artifact with polished content
                    if persistence_service and run_id and persistence_service.is_connected:
                        await persistence_service.update_scene_polished(
                            run_id, scene_number, polish_result
                        )

            # Store all polished drafts as a single artifact (for backward compatibility)
            await store_artifact("polish", "polished", {"scenes": polished_drafts})

        results["phases"]["polish"] = {"scenes": polished_drafts}

        logger.info(f"[run_full_generation] === GENERATION COMPLETE ===")
        logger.info(f"[run_full_generation] Total drafts: {len(drafts)}")
        logger.info(f"[run_full_generation] Total polished: {len(polished_drafts)}")
        logger.info(f"[run_full_generation] Phases completed: {list(results['phases'].keys())}")
        
        return results
