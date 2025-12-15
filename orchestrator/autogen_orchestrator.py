"""
AutoGen-based Storyteller Group Chat Orchestrator
Implements multi-agent narrative generation with real agent communication.
"""

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from autogen_agentchat.agents import AssistantAgent

from config import LLMConfiguration, LLMProvider
from models import (
    StoryProject,
)
from prompts import (
    ARCHITECT_SYSTEM_PROMPT,
    CRITIC_SYSTEM_PROMPT,
    PROFILER_SYSTEM_PROMPT,
    STRATEGIST_SYSTEM_PROMPT,
    WORLDBUILDER_SYSTEM_PROMPT,
    WRITER_SYSTEM_PROMPT,
)
from services.model_client import UnifiedModelClient
from services.qdrant_memory import QdrantMemoryService


class GenerationPhase(str, Enum):
    """Current phase of story generation."""
    GENESIS = "genesis"
    CHARACTERS = "characters"
    WORLDBUILDING = "worldbuilding"
    OUTLINING = "outlining"
    DRAFTING = "drafting"
    CRITIQUE = "critique"
    REVISION = "revision"


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
    ):
        self.config = config
        self.model_client = UnifiedModelClient(config)
        self.event_callback = event_callback
        self.state: Optional[GenerationState] = None

        # Agent instances
        self.architect: Optional[AssistantAgent] = None
        self.profiler: Optional[AssistantAgent] = None
        self.worldbuilder: Optional[AssistantAgent] = None
        self.strategist: Optional[AssistantAgent] = None
        self.writer: Optional[AssistantAgent] = None
        self.critic: Optional[AssistantAgent] = None

        # Qdrant memory service (optional)
        self.qdrant_memory: Optional[QdrantMemoryService] = None
        self._qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self._openai_api_key = openai_api_key

        # Initialize agents
        self._initialize_agents()

    async def initialize_memory(self, openai_api_key: Optional[str] = None) -> bool:
        """Initialize Qdrant memory service for character/worldbuilding storage.

        Args:
            openai_api_key: OpenAI API key for generating embeddings

        Returns:
            True if memory was initialized successfully, False otherwise
        """
        api_key = openai_api_key or self._openai_api_key
        if not api_key:
            self._emit_event("memory_init", {"status": "skipped", "reason": "no_api_key"})
            return False

        try:
            self.qdrant_memory = QdrantMemoryService(url=self._qdrant_url)
            await self.qdrant_memory.connect(openai_api_key=api_key)
            self._emit_event("memory_init", {"status": "connected", "url": self._qdrant_url})
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

        # Create agent instances with enhanced prompts
        # Note: We'll use custom message handling instead of AutoGen's built-in
        self.architect = self._create_agent("Architect", architect_prompt)
        self.profiler = self._create_agent("Profiler", profiler_prompt)
        self.worldbuilder = self._create_agent("Worldbuilder", worldbuilder_prompt)
        self.strategist = self._create_agent("Strategist", strategist_prompt)
        self.writer = self._create_agent("Writer", writer_prompt)
        self.critic = self._create_agent("Critic", critic_prompt)

    def _create_agent(self, name: str, system_prompt: str) -> Dict[str, Any]:
        """Create an agent configuration (not AutoGen agent directly due to async requirements)."""
        return {
            "name": name,
            "system_prompt": system_prompt,
            "llm_config": self._get_llm_config(name.lower()),
        }

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
            "content": content[:10000] if content else "",  # Increased limit to preserve JSON structure
            "to_agent": to_agent,
        })

    async def _call_agent(
        self,
        agent: Dict[str, Any],
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Call an agent and get its response."""
        messages = [{"role": "system", "content": agent["system_prompt"]}]

        if conversation_history:
            messages.extend(conversation_history)

        messages.append({"role": "user", "content": user_message})

        llm_config = agent["llm_config"]
        provider = self._get_provider_from_config(llm_config)
        model = llm_config["model"]

        self._emit_event("agent_start", {
            "agent": agent["name"],
            "phase": self.state.phase.value if self.state else "unknown",
        })

        response = await self.model_client.create_chat_completion(
            messages=messages,
            model=model,
            provider=provider,
            temperature=0.7,
            response_format={"type": "json_object"} if "json" in user_message.lower() else None,
        )

        self._emit_event("agent_complete", {
            "agent": agent["name"],
            "usage": response.usage,
        })

        # Emit the agent's message for chat visualization
        self._emit_agent_message(
            agent_name=agent["name"],
            message_type="response",
            content=response.content,
        )

        return response.content

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
        """Extract JSON from agent response."""
        try:
            # Try direct JSON parse
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to extract from markdown code block
        if "```json" in text:
            try:
                json_str = text.split("```json")[1].split("```")[0].strip()
                return json.loads(json_str)
            except (IndexError, json.JSONDecodeError):
                pass

        # Try to find JSON object in text
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass

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

    async def run_characters_phase(
        self,
        narrative: Dict[str, Any],
        moral_compass: str,
        target_audience: str,
    ) -> Dict[str, Any]:
        """
        Run the Characters phase with Profiler agent.
        Profiler can ask Architect questions about the narrative.
        """
        self.state.phase = GenerationPhase.CHARACTERS
        self._emit_event("phase_start", {"phase": "characters"})

        user_prompt = f"""
## Narrative Context

**Plot Summary:** {narrative.get("plot_summary", "")}

**Setting:** {narrative.get("setting_description", "")}

**Main Conflict:** {narrative.get("main_conflict", "")}

**Moral Compass:** {moral_compass}

**Target Audience:** {target_audience}

**Thematic Elements:** {", ".join(narrative.get("thematic_elements", []))}

**Required Character Types:** {", ".join(narrative.get("potential_characters", []))}

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
            thematic_elements=", ".join(narrative.get("thematic_elements", [])),
            characters_summary=characters_summary,
        )

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

**Thematic Elements:** {", ".join(narrative.get("thematic_elements", []))}

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
        """
        self.state.phase = GenerationPhase.DRAFTING
        scene_number = scene.get("scene_number", 1)
        self.state.current_scene = scene_number
        self.state.revision_count[scene_number] = 0

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

        emotional_beat = scene.get("emotional_beat", {})

        # Format memory context if available
        memory_context_str = ""
        if memory_context:
            relevant_chars = memory_context.get("relevant_characters", [])
            relevant_scenes = memory_context.get("relevant_scenes", [])

            if relevant_chars:
                memory_context_str += "\n## Retrieved Character Context (from memory)\n\n"
                for char in relevant_chars:
                    memory_context_str += f"**{char.get('name', 'Unknown')}**: {char.get('core_motivation', '')} - {char.get('inner_trap', '')}\n"

            if relevant_scenes:
                memory_context_str += "\n## Related Previous Scenes (from memory)\n\n"
                for scene_mem in relevant_scenes:
                    memory_context_str += f"- {scene_mem.get('title', 'Scene')}: {scene_mem.get('narrative_content', '')[:200]}...\n"

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
## Style Guidelines

**Moral Compass:** {moral_compass}

---

Write this scene following the outline. Output as valid JSON with narrative_content, sensory_details, dialogue_entries, etc.
"""

        # Writer creates initial draft
        writer_response = await self._call_agent(self.writer, user_prompt)
        writer_msg = self._parse_agent_message("Writer", writer_response)
        self.state.messages.append(writer_msg)

        draft = writer_msg.content if isinstance(writer_msg.content, dict) else None

        # Critic reviews the draft
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

Provide a comprehensive critique. If the scene needs revision (score < 7.0), use:
REVISION_REQUEST: [specific issues] INSTRUCTIONS: [how to fix]

If approved (score >= 7.0), say APPROVED and output your critique as JSON.
Revision {self.state.revision_count[scene_number] + 1} of {self.state.max_revisions} maximum.
"""

            critic_response = await self._call_agent(self.critic, critique_prompt)
            critic_msg = self._parse_agent_message("Critic", critic_response)
            self.state.messages.append(critic_msg)

            if critic_msg.type == "approved" or "APPROVED" in critic_response.upper():
                approved = True
                self._emit_event("scene_approved", {
                    "scene_number": scene_number,
                    "revisions": self.state.revision_count[scene_number],
                })
            elif critic_msg.type == "revision_request":
                self.state.revision_count[scene_number] += 1

                self._emit_event("revision_requested", {
                    "scene_number": scene_number,
                    "revision_number": self.state.revision_count[scene_number],
                    "issues": critic_msg.content.get("issues", ""),
                })

                # Writer revises
                revision_prompt = f"""
The Critic requests revisions:

Issues: {critic_msg.content.get("issues", "")}
Instructions: {critic_msg.content.get("instructions", "")}

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
                # Treat as approved if no clear revision request
                approved = True

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

    async def run_demo_generation(
        self,
        project: StoryProject,
        constraints: Optional[Dict[str, Any]] = None,
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
            writer_prompt = f"""
Using the narrative foundation:

Concept: {json.dumps(architect_msg.content, indent=2) if isinstance(architect_msg.content, dict) else architect_msg.content}

Characters: {json.dumps(profiler_msg.content, indent=2) if isinstance(profiler_msg.content, dict) else profiler_msg.content}

Structure: {json.dumps(strategist_msg.content, indent=2) if isinstance(strategist_msg.content, dict) else strategist_msg.content}
{constraint_context}
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
    ) -> Dict[str, Any]:
        """
        Run the complete story generation pipeline with optional Qdrant memory integration.

        Args:
            project: Story project configuration
            target_word_count: Target word count for the full story
            estimated_scenes: Estimated number of scenes
            preferred_structure: Story structure (ThreeAct, HeroJourney, etc.)
            openai_api_key: OpenAI API key for embeddings (enables Qdrant memory)
            max_revisions: Maximum Writer↔Critic revision cycles per scene (1-5)
        """
        results = {
            "project": project.model_dump(),
            "phases": {},
            "memory_enabled": False,
        }

        # Generate a unique project ID for memory storage
        project_id = project.seed_idea[:20].replace(" ", "_") + "_" + str(hash(project.seed_idea))[:8]

        # Initialize Qdrant memory if API key provided
        if openai_api_key:
            memory_initialized = await self.initialize_memory(openai_api_key)
            results["memory_enabled"] = memory_initialized

        # Phase 1: Genesis (this initializes self.state)
        genesis_result = await self.run_genesis_phase(project)

        # Set max_revisions in state AFTER genesis phase creates it
        if self.state:
            self.state.max_revisions = max_revisions
        results["phases"]["genesis"] = genesis_result

        if not genesis_result.get("narrative_possibility"):
            return {"error": "Genesis phase failed", **results}

        # Phase 2: Characters
        characters_result = await self.run_characters_phase(
            narrative=genesis_result["narrative_possibility"],
            moral_compass=project.moral_compass.value,
            target_audience=project.target_audience,
        )
        results["phases"]["characters"] = characters_result

        if not characters_result.get("characters"):
            return {"error": "Characters phase failed", **results}

        # Store characters in Qdrant memory for later retrieval
        characters = characters_result.get("characters", [])
        if isinstance(characters, list):
            await self._store_characters_in_memory(project_id, characters)

        # Phase 3: Worldbuilding
        worldbuilding_result = await self.run_worldbuilding_phase(
            narrative=genesis_result["narrative_possibility"],
            characters=characters_result["characters"],
            moral_compass=project.moral_compass.value,
            target_audience=project.target_audience,
        )
        results["phases"]["worldbuilding"] = worldbuilding_result

        # Worldbuilding is optional - continue even if it fails
        worldbuilding = worldbuilding_result.get("worldbuilding", {})

        # Phase 4: Outlining
        outlining_result = await self.run_outlining_phase(
            narrative=genesis_result["narrative_possibility"],
            characters=characters_result["characters"],
            moral_compass=project.moral_compass.value,
            target_word_count=target_word_count,
            estimated_scenes=estimated_scenes,
            preferred_structure=preferred_structure,
            worldbuilding=worldbuilding,
        )
        results["phases"]["outlining"] = outlining_result

        if not outlining_result.get("outline"):
            return {"error": "Outlining phase failed", **results}

        # Phase 5: Drafting (all scenes)
        outline = outlining_result["outline"]
        scenes = outline.get("scenes", [])
        drafts = []

        previous_summary = "N/A"
        for i, scene in enumerate(scenes):
            # Retrieve relevant characters from memory for this scene
            scene_context = scene.get("title", "") + " " + scene.get("conflict", "")
            relevant_characters = await self._retrieve_relevant_characters(project_id, scene_context, limit=3)

            # Retrieve relevant previous scenes for continuity
            relevant_scenes = await self._retrieve_relevant_scenes(project_id, scene_context, limit=2)

            # Retrieve relevant worldbuilding elements for this scene
            relevant_worldbuilding = await self._retrieve_worldbuilding(project_id, scene_context, limit=3)

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

            draft_result = await self.run_drafting_phase(
                scene=scene,
                characters=characters_result["characters"],
                moral_compass=project.moral_compass.value,
                worldbuilding=scene_worldbuilding if scene_worldbuilding else None,
                previous_scene_summary=previous_summary,
                memory_context={
                    "relevant_characters": relevant_characters,
                    "relevant_scenes": relevant_scenes,
                } if (relevant_characters or relevant_scenes) else None,
            )
            drafts.append(draft_result)

            # Store drafted scene in memory for continuity
            if draft_result.get("draft"):
                draft = draft_result["draft"]
                await self._store_scene_in_memory(project_id, i + 1, draft)
                previous_summary = draft.get("narrative_content", "")[:500] + "..."

        results["phases"]["drafting"] = {"scenes": drafts}

        return results
