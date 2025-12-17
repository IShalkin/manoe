"""
Context Management and Summarization for MANOE

This module implements context window management strategies:
- Summarization chains for compressing old content
- Token budget management
- Archiving raw data while keeping summaries in context

Key concepts:
- SummarizationChain: Compresses content while preserving key information
- ContextManager: Manages token budgets and context windows
- SummaryCache: Caches summaries for efficient retrieval
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class Summary:
    """A summary of content."""
    content: str
    source_type: str  # "scene", "scenes_batch", "character", etc.
    source_ids: List[str]  # IDs of summarized content
    token_count: int
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContextBudget:
    """Token budget configuration for context management."""
    total_tokens: int = 128000  # Total context window
    system_prompt_tokens: int = 2000  # Reserved for system prompt
    output_tokens: int = 4000  # Reserved for output
    summary_tokens: int = 2000  # Reserved for summaries
    current_scene_tokens: int = 4000  # Reserved for current scene context
    
    @property
    def available_for_context(self) -> int:
        """Tokens available for additional context."""
        return (
            self.total_tokens
            - self.system_prompt_tokens
            - self.output_tokens
            - self.summary_tokens
            - self.current_scene_tokens
        )


class SummarizationChain:
    """
    Chain for summarizing content while preserving key information.
    
    Uses a hierarchical approach:
    1. Individual scene summaries
    2. Batch summaries (every N scenes)
    3. Arc summaries (story sections)
    """
    
    def __init__(
        self,
        model_client: Any = None,
        summarizer_model: str = "gpt-4o-mini",
        summarizer_provider: str = "openai",
        batch_size: int = 5,  # Summarize every N scenes
    ):
        self.model_client = model_client
        self.summarizer_model = summarizer_model
        self.summarizer_provider = summarizer_provider
        self.batch_size = batch_size
        self.summaries: Dict[str, Summary] = {}  # key -> Summary
    
    def _build_scene_summary_prompt(self, scene_content: str, scene_number: int) -> str:
        """Build prompt for summarizing a single scene."""
        return f"""Summarize the following scene (Scene {scene_number}) in 2-3 sentences, capturing:
- Key plot events
- Character actions and emotional states
- Important revelations or changes
- Setting details if significant

SCENE CONTENT:
{scene_content}

Provide a concise summary that preserves the essential narrative information."""
    
    def _build_batch_summary_prompt(self, scene_summaries: List[str], start_scene: int, end_scene: int) -> str:
        """Build prompt for summarizing a batch of scenes."""
        summaries_text = "\n\n".join([
            f"Scene {start_scene + i}: {summary}"
            for i, summary in enumerate(scene_summaries)
        ])
        
        return f"""Summarize the following scenes (Scenes {start_scene}-{end_scene}) into a cohesive paragraph that captures:
- The main narrative arc across these scenes
- Key character developments
- Important plot points
- Emotional progression

SCENE SUMMARIES:
{summaries_text}

Provide a unified summary (3-5 sentences) that a writer could use to maintain continuity."""
    
    def _build_arc_summary_prompt(self, batch_summaries: List[str], arc_name: str) -> str:
        """Build prompt for summarizing a story arc."""
        summaries_text = "\n\n".join(batch_summaries)
        
        return f"""Summarize the following story arc ({arc_name}) into a comprehensive but concise summary:
- Major plot developments
- Character arcs and transformations
- Thematic elements
- Key turning points

BATCH SUMMARIES:
{summaries_text}

Provide an arc summary (5-7 sentences) that captures the essential narrative progression."""
    
    async def summarize_scene(
        self,
        scene_content: str,
        scene_number: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Summary:
        """Summarize a single scene."""
        prompt = self._build_scene_summary_prompt(scene_content, scene_number)
        
        if self.model_client:
            try:
                from config import LLMProvider
                
                response = await self.model_client.create_chat_completion(
                    messages=[
                        {"role": "system", "content": "You are a skilled story summarizer."},
                        {"role": "user", "content": prompt},
                    ],
                    model=self.summarizer_model,
                    provider=LLMProvider(self.summarizer_provider),
                    temperature=0.3,
                    max_tokens=300,
                )
                summary_text = response.content
            except Exception as e:
                summary_text = f"[Summary generation failed: {e}]"
        else:
            # Fallback: simple truncation
            summary_text = self._simple_summarize(scene_content, max_length=300)
        
        summary = Summary(
            content=summary_text,
            source_type="scene",
            source_ids=[f"scene_{scene_number}"],
            token_count=len(summary_text.split()) * 1.3,  # Rough token estimate
            metadata=metadata or {},
        )
        
        self.summaries[f"scene_{scene_number}"] = summary
        return summary
    
    async def summarize_batch(
        self,
        scene_summaries: List[Summary],
        start_scene: int,
        end_scene: int,
    ) -> Summary:
        """Summarize a batch of scene summaries."""
        summaries_text = [s.content for s in scene_summaries]
        prompt = self._build_batch_summary_prompt(summaries_text, start_scene, end_scene)
        
        if self.model_client:
            try:
                from config import LLMProvider
                
                response = await self.model_client.create_chat_completion(
                    messages=[
                        {"role": "system", "content": "You are a skilled story summarizer."},
                        {"role": "user", "content": prompt},
                    ],
                    model=self.summarizer_model,
                    provider=LLMProvider(self.summarizer_provider),
                    temperature=0.3,
                    max_tokens=500,
                )
                summary_text = response.content
            except Exception:
                summary_text = " ".join(summaries_text)[:500]
        else:
            summary_text = " ".join(summaries_text)[:500]
        
        summary = Summary(
            content=summary_text,
            source_type="scenes_batch",
            source_ids=[f"scene_{i}" for i in range(start_scene, end_scene + 1)],
            token_count=len(summary_text.split()) * 1.3,
        )
        
        self.summaries[f"batch_{start_scene}_{end_scene}"] = summary
        return summary
    
    def _simple_summarize(self, text: str, max_length: int = 300) -> str:
        """Simple summarization by extracting key sentences."""
        sentences = text.replace("\n", " ").split(". ")
        
        if len(sentences) <= 3:
            result = ". ".join(sentences)
            return result[:max_length] + "..." if len(result) > max_length else result
        
        # Take first, middle, and last sentences
        key_sentences = [
            sentences[0],
            sentences[len(sentences) // 2],
            sentences[-1],
        ]
        
        result = ". ".join(key_sentences)
        return result[:max_length] + "..." if len(result) > max_length else result
    
    def get_summary(self, key: str) -> Optional[Summary]:
        """Get a cached summary by key."""
        return self.summaries.get(key)
    
    def get_all_summaries(self, source_type: Optional[str] = None) -> List[Summary]:
        """Get all summaries, optionally filtered by type."""
        if source_type:
            return [s for s in self.summaries.values() if s.source_type == source_type]
        return list(self.summaries.values())


class ContextManager:
    """
    Manages context window and token budgets for generation.
    
    Responsibilities:
    - Track token usage across context components
    - Decide when to summarize old content
    - Build optimized context for each agent call
    - Archive raw data while keeping summaries active
    """
    
    def __init__(
        self,
        budget: Optional[ContextBudget] = None,
        summarization_chain: Optional[SummarizationChain] = None,
        summarize_after_scenes: int = 5,
    ):
        self.budget = budget or ContextBudget()
        self.summarization_chain = summarization_chain or SummarizationChain()
        self.summarize_after_scenes = summarize_after_scenes
        
        # Context components
        self.active_summaries: List[Summary] = []
        self.archived_scene_ids: List[str] = []
        self.current_token_usage: Dict[str, int] = {}
    
    def estimate_tokens(self, text: str) -> int:
        """Estimate token count for text."""
        # Rough estimate: ~1.3 tokens per word for English
        return int(len(text.split()) * 1.3)
    
    async def process_scene(
        self,
        scene_number: int,
        scene_content: str,
        force_summarize: bool = False,
    ) -> None:
        """
        Process a completed scene for context management.
        
        If we've accumulated enough scenes, trigger summarization.
        """
        # Summarize the individual scene
        await self.summarization_chain.summarize_scene(
            scene_content=scene_content,
            scene_number=scene_number,
        )
        
        # Check if we should create a batch summary
        scene_summaries = self.summarization_chain.get_all_summaries(source_type="scene")
        unsummarized_count = len([
            s for s in scene_summaries
            if s.source_ids[0] not in self.archived_scene_ids
        ])
        
        if unsummarized_count >= self.summarize_after_scenes or force_summarize:
            # Get the unsummarized scene summaries
            start_scene = scene_number - unsummarized_count + 1
            end_scene = scene_number
            
            batch_summaries = [
                self.summarization_chain.get_summary(f"scene_{i}")
                for i in range(start_scene, end_scene + 1)
            ]
            batch_summaries = [s for s in batch_summaries if s is not None]
            
            if batch_summaries:
                # Create batch summary
                batch_summary = await self.summarization_chain.summarize_batch(
                    scene_summaries=batch_summaries,
                    start_scene=start_scene,
                    end_scene=end_scene,
                )
                
                # Add to active summaries
                self.active_summaries.append(batch_summary)
                
                # Archive the individual scene IDs
                for i in range(start_scene, end_scene + 1):
                    self.archived_scene_ids.append(f"scene_{i}")
    
    def build_context(
        self,
        current_scene: int,
        include_characters: bool = True,
        include_worldbuilding: bool = True,
        include_outline: bool = True,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Build optimized context for an agent call.
        
        Returns a context dict with:
        - story_summary: Compressed summary of past events
        - recent_scenes: Last few scene summaries
        - current_scene_outline: Outline for current scene
        - characters: Relevant character info (if requested)
        - worldbuilding: Relevant world info (if requested)
        """
        max_tokens = max_tokens or self.budget.available_for_context
        
        context = {
            "story_summary": "",
            "recent_scenes": [],
            "current_scene_outline": None,
            "characters": [],
            "worldbuilding": {},
        }
        
        token_count = 0
        
        # Add batch summaries (compressed history)
        if self.active_summaries:
            summary_texts = [s.content for s in self.active_summaries]
            context["story_summary"] = "\n\n".join(summary_texts)
            token_count += self.estimate_tokens(context["story_summary"])
        
        # Add recent scene summaries (not yet batched)
        recent_summaries = []
        for i in range(max(1, current_scene - 3), current_scene):
            summary = self.summarization_chain.get_summary(f"scene_{i}")
            if summary and f"scene_{i}" not in self.archived_scene_ids:
                recent_summaries.append({
                    "scene_number": i,
                    "summary": summary.content,
                })
                token_count += self.estimate_tokens(summary.content)
        
        context["recent_scenes"] = recent_summaries
        
        return context
    
    def get_token_usage(self) -> Dict[str, int]:
        """Get current token usage breakdown."""
        usage = {
            "story_summary": self.estimate_tokens(
                "\n".join(s.content for s in self.active_summaries)
            ),
            "archived_scenes": len(self.archived_scene_ids),
            "active_scene_summaries": len(
                self.summarization_chain.get_all_summaries(source_type="scene")
            ) - len(self.archived_scene_ids),
        }
        return usage
    
    def should_summarize(self, current_scene: int) -> bool:
        """Check if we should trigger summarization."""
        scene_summaries = self.summarization_chain.get_all_summaries(source_type="scene")
        unsummarized = len([
            s for s in scene_summaries
            if s.source_ids[0] not in self.archived_scene_ids
        ])
        return unsummarized >= self.summarize_after_scenes


class ContextBuilder:
    """
    Builds context strings for agent prompts.
    
    Combines various context sources into a formatted string
    that fits within token limits.
    """
    
    def __init__(self, context_manager: ContextManager):
        self.context_manager = context_manager
    
    def build_writer_context(
        self,
        current_scene: int,
        scene_outline: Dict[str, Any],
        characters: List[Dict[str, Any]],
        worldbuilding: Dict[str, Any],
        narrator_config: Dict[str, Any],
        max_tokens: int = 8000,
        key_constraints_text: Optional[str] = None,
        is_revision: bool = False,
    ) -> str:
        """
        Build context string for the Writer agent.
        
        Args:
            current_scene: Current scene number
            scene_outline: Outline for the current scene
            characters: List of relevant characters
            worldbuilding: Worldbuilding context
            narrator_config: Narrator configuration
            max_tokens: Maximum tokens for context
            key_constraints_text: Pre-formatted key constraints string (from KeyConstraints.to_context_string())
            is_revision: Whether this is a revision (constraints are ALWAYS injected for revisions)
        """
        context = self.context_manager.build_context(
            current_scene=current_scene,
            include_characters=True,
            include_worldbuilding=True,
            max_tokens=max_tokens,
        )
        
        sections = []
        
        # KEY CONSTRAINTS - ALWAYS inject for revisions to prevent Context Drift
        # These are immutable facts that must not be violated
        if key_constraints_text and (is_revision or key_constraints_text):
            sections.append(key_constraints_text)
        
        # Story summary
        if context["story_summary"]:
            sections.append(f"=== STORY SO FAR ===\n{context['story_summary']}")
        
        # Recent scenes
        if context["recent_scenes"]:
            recent_text = "\n".join([
                f"Scene {s['scene_number']}: {s['summary']}"
                for s in context["recent_scenes"]
            ])
            sections.append(f"=== RECENT SCENES ===\n{recent_text}")
        
        # Current scene outline
        if scene_outline:
            outline_text = json.dumps(scene_outline, indent=2)
            sections.append(f"=== CURRENT SCENE OUTLINE ===\n{outline_text}")
        
        # Characters
        if characters:
            char_text = "\n".join([
                f"- {c.get('name', 'Unknown')}: {c.get('description', '')[:200]}"
                for c in characters[:5]  # Limit to 5 most relevant
            ])
            sections.append(f"=== KEY CHARACTERS ===\n{char_text}")
        
        # Worldbuilding
        if worldbuilding:
            world_text = json.dumps(worldbuilding, indent=2)[:1000]
            sections.append(f"=== WORLD CONTEXT ===\n{world_text}")
        
        # Narrator config
        if narrator_config:
            narrator_text = f"Voice: {narrator_config.get('voice', 'N/A')}\n"
            narrator_text += f"Perspective: {narrator_config.get('perspective', 'N/A')}\n"
            narrator_text += f"Style: {narrator_config.get('style', 'N/A')}"
            sections.append(f"=== NARRATOR ===\n{narrator_text}")
        
        return "\n\n".join(sections)
    
    def build_critic_context(
        self,
        scene_draft: str,
        scene_outline: Dict[str, Any],
        characters: List[Dict[str, Any]],
        previous_critiques: Optional[List[Dict[str, Any]]] = None,
        max_tokens: int = 6000,
        key_constraints_text: Optional[str] = None,
    ) -> str:
        """
        Build context string for the Critic agent.
        
        Args:
            scene_draft: The draft text to critique
            scene_outline: Outline for the scene
            characters: List of relevant characters
            previous_critiques: Previous critique feedback
            max_tokens: Maximum tokens for context
            key_constraints_text: Pre-formatted key constraints string (from KeyConstraints.to_context_string())
                                  Critic MUST check draft against these constraints
        """
        sections = []
        
        # KEY CONSTRAINTS - Critic must verify draft doesn't violate these
        # These are immutable facts that prevent Context Drift
        if key_constraints_text:
            sections.append(key_constraints_text)
            sections.append("IMPORTANT: Verify the draft does NOT violate any of the above constraints.")
        
        # Scene draft to critique
        sections.append(f"=== SCENE DRAFT ===\n{scene_draft}")
        
        # Scene outline for reference
        if scene_outline:
            outline_text = json.dumps(scene_outline, indent=2)
            sections.append(f"=== SCENE OUTLINE ===\n{outline_text}")
        
        # Characters for consistency checking
        if characters:
            char_text = "\n".join([
                f"- {c.get('name', 'Unknown')}: {c.get('traits', [])}"
                for c in characters[:5]
            ])
            sections.append(f"=== CHARACTERS ===\n{char_text}")
        
        # Previous critiques (for revision context)
        if previous_critiques:
            critique_text = "\n".join([
                f"Revision {i+1}: {c.get('feedback', '')[:200]}"
                for i, c in enumerate(previous_critiques[-2:])  # Last 2 critiques
            ])
            sections.append(f"=== PREVIOUS FEEDBACK ===\n{critique_text}")
        
        return "\n\n".join(sections)
