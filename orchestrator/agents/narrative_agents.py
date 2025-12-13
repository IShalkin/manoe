"""
Narrative Agent Implementations for MANOE
Specialized agents for each phase of narrative generation.
"""

from typing import Any, Dict

from ..models import (
    CharacterProfile,
    NarrativePossibility,
    PlotOutline,
    SceneCritique,
    SceneDraft,
    StoryProject,
)
from ..prompts import (
    ARCHITECT_SYSTEM_PROMPT,
    ARCHITECT_USER_PROMPT_TEMPLATE,
    CRITIC_SYSTEM_PROMPT,
    CRITIC_USER_PROMPT_TEMPLATE,
    PROFILER_SYSTEM_PROMPT,
    PROFILER_USER_PROMPT_TEMPLATE,
    STRATEGIST_SYSTEM_PROMPT,
    STRATEGIST_USER_PROMPT_TEMPLATE,
    WRITER_SYSTEM_PROMPT,
    WRITER_USER_PROMPT_TEMPLATE,
)
from .base import BaseAgent, LLMClient


class ArchitectAgent(BaseAgent):
    """
    Architect Agent - Genesis Phase
    Transforms seed ideas into structured narrative possibilities.
    """

    def __init__(self, llm_client: LLMClient):
        super().__init__(
            name="Architect",
            llm_client=llm_client,
            system_prompt=ARCHITECT_SYSTEM_PROMPT,
        )

    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a story project configuration and generate narrative possibility."""
        project = StoryProject.model_validate(input_data)

        # Build custom moral system section if needed
        custom_moral_section = ""
        if project.moral_compass.value == "UserDefined" and project.custom_moral_system:
            custom_moral_section = f"**Custom Moral System:** {project.custom_moral_system}"

        user_prompt = ARCHITECT_USER_PROMPT_TEMPLATE.format(
            seed_idea=project.seed_idea,
            moral_compass=project.moral_compass.value,
            target_audience=project.target_audience,
            theme_core=", ".join(project.theme_core) if project.theme_core else "Not specified",
            tone_style_references=", ".join(project.tone_style_references) if project.tone_style_references else "Not specified",
            custom_moral_system_section=custom_moral_section,
        )

        result, event = await self.generate_with_logging(
            user_prompt=user_prompt,
            response_model=NarrativePossibility,
            project_id=input_data.get("project_id", "unknown"),
        )

        return {
            "narrative_possibility": result.model_dump(),
            "event": event.model_dump(),
        }


class ProfilerAgent(BaseAgent):
    """
    Profiler Agent - Character & World Design Phase
    Creates psychologically deep character profiles.
    """

    def __init__(self, llm_client: LLMClient):
        super().__init__(
            name="Profiler",
            llm_client=llm_client,
            system_prompt=PROFILER_SYSTEM_PROMPT,
        )

    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process narrative possibility and generate character profiles."""
        narrative = input_data.get("narrative_possibility", {})

        user_prompt = PROFILER_USER_PROMPT_TEMPLATE.format(
            plot_summary=narrative.get("plot_summary", ""),
            setting_description=narrative.get("setting_description", ""),
            main_conflict=narrative.get("main_conflict", ""),
            moral_compass=input_data.get("moral_compass", "Ambiguous"),
            target_audience=input_data.get("target_audience", ""),
            thematic_elements=", ".join(narrative.get("thematic_elements", [])),
            potential_characters=", ".join(narrative.get("potential_characters", [])),
        )

        # Generate characters as a list
        response = await self.llm_client.generate(
            system_prompt=self.system_prompt,
            user_prompt=user_prompt,
            temperature=0.8,  # Slightly higher for creative character generation
        )

        # Parse the response as a list of character profiles
        import json
        try:
            characters_data = json.loads(response)
            if isinstance(characters_data, dict) and "characters" in characters_data:
                characters_data = characters_data["characters"]
            characters = [CharacterProfile.model_validate(c) for c in characters_data]
        except Exception as e:
            # Try to extract JSON from markdown
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
                characters_data = json.loads(json_str)
                if isinstance(characters_data, dict) and "characters" in characters_data:
                    characters_data = characters_data["characters"]
                characters = [CharacterProfile.model_validate(c) for c in characters_data]
            else:
                raise ValueError(f"Failed to parse character profiles: {e}")

        return {
            "characters": [c.model_dump() for c in characters],
            "character_count": len(characters),
        }


class StrategistAgent(BaseAgent):
    """
    Strategist Agent - Plotting & Outlining Phase
    Creates detailed scene-by-scene plot outlines.
    """

    def __init__(self, llm_client: LLMClient):
        super().__init__(
            name="Strategist",
            llm_client=llm_client,
            system_prompt=STRATEGIST_SYSTEM_PROMPT,
        )

    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process narrative and characters to generate plot outline."""
        narrative = input_data.get("narrative_possibility", {})
        characters = input_data.get("characters", [])

        # Format character profiles for the prompt
        character_profiles_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}** ({c.get('archetype', 'Unknown')})\n"
            f"- Core Motivation: {c.get('core_motivation', 'Unknown')}\n"
            f"- Inner Trap: {c.get('inner_trap', 'Unknown')}\n"
            f"- Psychological Wound: {c.get('psychological_wound', 'Unknown')}\n"
            f"- Potential Arc: {c.get('potential_arc', 'Unknown')}"
            for c in characters
        ])

        user_prompt = STRATEGIST_USER_PROMPT_TEMPLATE.format(
            plot_summary=narrative.get("plot_summary", ""),
            setting_description=narrative.get("setting_description", ""),
            main_conflict=narrative.get("main_conflict", ""),
            moral_compass=input_data.get("moral_compass", "Ambiguous"),
            thematic_elements=", ".join(narrative.get("thematic_elements", [])),
            character_profiles=character_profiles_str,
            target_word_count=input_data.get("target_word_count", 50000),
            estimated_scenes=input_data.get("estimated_scenes", 20),
            preferred_structure=input_data.get("preferred_structure", "ThreeAct"),
        )

        result, event = await self.generate_with_logging(
            user_prompt=user_prompt,
            response_model=PlotOutline,
            project_id=input_data.get("project_id", "unknown"),
        )

        return {
            "outline": result.model_dump(),
            "event": event.model_dump(),
        }


class WriterAgent(BaseAgent):
    """
    Writer Agent - Drafting Phase
    Transforms scene outlines into vivid prose.
    """

    def __init__(self, llm_client: LLMClient):
        super().__init__(
            name="Writer",
            llm_client=llm_client,
            system_prompt=WRITER_SYSTEM_PROMPT,
        )

    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process scene outline and generate draft."""
        scene = input_data.get("scene", {})
        characters = input_data.get("characters", [])
        worldbuilding = input_data.get("worldbuilding", {})

        # Format character profiles
        character_profiles_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}**\n"
            f"- Visual Signature: {c.get('visual_signature', 'Unknown')}\n"
            f"- Quirks: {', '.join(c.get('quirks', []))}\n"
            f"- Coping Mechanism: {c.get('coping_mechanism', 'Unknown')}"
            for c in characters
            if c.get("name") in scene.get("characters_present", [])
        ])

        emotional_beat = scene.get("emotional_beat", {})

        user_prompt = WRITER_USER_PROMPT_TEMPLATE.format(
            scene_number=scene.get("scene_number", 1),
            scene_title=scene.get("title", "Untitled"),
            setting=scene.get("setting", ""),
            characters_present=", ".join(scene.get("characters_present", [])),
            conflict_type=scene.get("conflict_type", "HeroVsSelf"),
            conflict_description=scene.get("conflict_description", ""),
            emotional_initial=emotional_beat.get("initial_state", ""),
            emotional_climax=emotional_beat.get("climax", ""),
            emotional_final=emotional_beat.get("final_state", ""),
            subtext_layer=scene.get("subtext_layer", ""),
            plot_advancement=scene.get("plot_advancement", ""),
            character_development=scene.get("character_development", ""),
            estimated_word_count=scene.get("estimated_word_count", 1500),
            character_profiles=character_profiles_str,
            worldbuilding_context=str(worldbuilding),
            previous_scene_summary=input_data.get("previous_scene_summary", "N/A"),
            moral_compass=input_data.get("moral_compass", "Ambiguous"),
            tone_style=input_data.get("tone_style", "Not specified"),
            narrative_perspective=input_data.get("narrative_perspective", "Third person limited"),
        )

        result, event = await self.generate_with_logging(
            user_prompt=user_prompt,
            response_model=SceneDraft,
            project_id=input_data.get("project_id", "unknown"),
            temperature=0.8,  # Higher temperature for creative writing
        )

        return {
            "draft": result.model_dump(),
            "event": event.model_dump(),
        }


class CriticAgent(BaseAgent):
    """
    Critic Agent - Refinement & Feedback Phase
    Provides artistic critique of scene drafts.
    """

    def __init__(self, llm_client: LLMClient):
        super().__init__(
            name="Critic",
            llm_client=llm_client,
            system_prompt=CRITIC_SYSTEM_PROMPT,
        )

    async def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process scene draft and generate critique."""
        draft = input_data.get("draft", {})
        scene_outline = input_data.get("scene_outline", {})
        characters = input_data.get("characters", [])

        emotional_beat = scene_outline.get("emotional_beat", {})

        # Format character profiles for consistency check
        character_profiles_str = "\n\n".join([
            f"**{c.get('name', 'Unknown')}**\n"
            f"- Core Motivation: {c.get('core_motivation', 'Unknown')}\n"
            f"- Coping Mechanism: {c.get('coping_mechanism', 'Unknown')}\n"
            f"- Quirks: {', '.join(c.get('quirks', []))}"
            for c in characters
        ])

        # Format sensory details
        sensory = draft.get("sensory_details", {})
        sensory_str = "\n".join([
            f"- Sight: {', '.join(sensory.get('sight', []))}",
            f"- Sound: {', '.join(sensory.get('sound', []))}",
            f"- Smell: {', '.join(sensory.get('smell', []))}",
            f"- Taste: {', '.join(sensory.get('taste', []))}",
            f"- Touch: {', '.join(sensory.get('touch', []))}",
            f"- Internal: {', '.join(sensory.get('internal', []))}",
        ])

        # Format dialogue entries
        dialogue_entries = draft.get("dialogue_entries", [])
        dialogue_str = "\n\n".join([
            f"**{d.get('speaker', 'Unknown')}:** \"{d.get('spoken_text', '')}\"\n"
            f"  Subtext: {d.get('subtext', 'None')}\n"
            f"  Action: {d.get('action_beat', 'None')}"
            for d in dialogue_entries
        ])

        user_prompt = CRITIC_USER_PROMPT_TEMPLATE.format(
            scene_number=draft.get("scene_number", 1),
            scene_title=draft.get("title", "Untitled"),
            emotional_initial=emotional_beat.get("initial_state", ""),
            emotional_climax=emotional_beat.get("climax", ""),
            emotional_final=emotional_beat.get("final_state", ""),
            required_subtext=scene_outline.get("subtext_layer", ""),
            moral_compass=input_data.get("moral_compass", "Ambiguous"),
            target_audience=input_data.get("target_audience", ""),
            scene_content=draft.get("narrative_content", ""),
            sensory_details=sensory_str,
            dialogue_entries=dialogue_str,
            character_profiles=character_profiles_str,
            previous_critique=input_data.get("previous_critique", "N/A - First review"),
        )

        result, event = await self.generate_with_logging(
            user_prompt=user_prompt,
            response_model=SceneCritique,
            project_id=input_data.get("project_id", "unknown"),
            temperature=0.5,  # Lower temperature for consistent critique
        )

        return {
            "critique": result.model_dump(),
            "approved": result.approved,
            "event": event.model_dump(),
        }
