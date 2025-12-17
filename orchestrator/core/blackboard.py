"""
Blackboard Pattern (Shared State) for MANOE

This module implements the Blackboard Architecture pattern where all agents
read from and write to a unified state object. This replaces the traditional
data passing through function parameters.

Key concepts:
- BlackboardState: The shared state object containing all generation data
- RunContext: Execution context with access to services and state
- State persistence: Automatic checkpointing to Supabase for recovery
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set


class GenerationPhase(str, Enum):
    """Current phase of story generation."""
    GENESIS = "genesis"
    CHARACTERS = "characters"
    NARRATOR_DESIGN = "narrator_design"
    WORLDBUILDING = "worldbuilding"
    OUTLINING = "outlining"
    MOTIF_LAYER = "motif_layer"
    ADVANCED_PLANNING = "advanced_planning"
    DRAFTING = "drafting"
    POLISH = "polish"
    COMPLETED = "completed"


@dataclass
class NarrativeData:
    """Narrative/Genesis phase data."""
    seed_idea: str = ""
    narrative_possibility: Dict[str, Any] = field(default_factory=dict)
    themes: List[str] = field(default_factory=list)
    tone: str = ""
    genre: str = ""
    target_audience: str = ""
    moral_compass: str = "ambiguous"


@dataclass
class CharacterData:
    """Character data from profiling phase."""
    characters: List[Dict[str, Any]] = field(default_factory=list)
    protagonist: Optional[Dict[str, Any]] = None
    antagonist: Optional[Dict[str, Any]] = None
    supporting_cast: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class WorldbuildingData:
    """Worldbuilding phase data."""
    worldbuilding: Dict[str, Any] = field(default_factory=dict)
    geography: List[Dict[str, Any]] = field(default_factory=list)
    cultures: List[Dict[str, Any]] = field(default_factory=list)
    rules: List[Dict[str, Any]] = field(default_factory=list)
    history: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class OutlineData:
    """Outline phase data."""
    outline: Dict[str, Any] = field(default_factory=dict)
    scenes: List[Dict[str, Any]] = field(default_factory=list)
    structure: str = ""
    estimated_word_count: int = 0


@dataclass
class AdvancedPlanningData:
    """Advanced planning phase data."""
    motif_bible: Dict[str, Any] = field(default_factory=dict)
    contradiction_maps: Dict[str, Any] = field(default_factory=dict)
    emotional_beat_sheet: Dict[str, Any] = field(default_factory=dict)
    complexity_checklist: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DraftingData:
    """Drafting phase data."""
    drafts: List[Dict[str, Any]] = field(default_factory=list)
    current_scene: int = 0
    total_scenes: int = 0
    critiques: Dict[int, List[Dict[str, Any]]] = field(default_factory=dict)
    revision_counts: Dict[int, int] = field(default_factory=dict)


@dataclass
class NarratorConfig:
    """Narrator configuration."""
    voice: str = ""
    perspective: str = ""
    style: str = ""
    design: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConstraintFact:
    """
    A single immutable constraint fact.
    
    These facts are NEVER deleted or compressed by summarization.
    They are always injected into context during revisions.
    """
    fact: str
    category: str  # "character_state", "world_rule", "plot_fact", "continuity"
    source: str  # Which agent/phase added this
    scene_id: Optional[int] = None  # Scene this applies to (None = global)
    character_name: Optional[str] = None  # Character this applies to
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "fact": self.fact,
            "category": self.category,
            "source": self.source,
            "scene_id": self.scene_id,
            "character_name": self.character_name,
            "created_at": self.created_at.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ConstraintFact":
        return cls(
            fact=data["fact"],
            category=data["category"],
            source=data["source"],
            scene_id=data.get("scene_id"),
            character_name=data.get("character_name"),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else datetime.utcnow(),
        )


@dataclass
class KeyConstraints:
    """
    Immutable key constraints that prevent Context Drift.
    
    These constraints are:
    - APPEND-ONLY: Facts can only be added, never removed
    - ALWAYS INJECTED: Into context during Writer/Critic revisions
    - NEVER COMPRESSED: Summarization chain ignores these
    
    Categories:
    - character_state: Physical/emotional states (e.g., "Hero is wounded in left arm")
    - world_rule: World rules that must be followed (e.g., "Magic requires verbal incantation")
    - plot_fact: Plot facts that can't be contradicted (e.g., "The letter was burned")
    - continuity: Scene-to-scene continuity (e.g., "It's raining outside")
    """
    facts: List[ConstraintFact] = field(default_factory=list)
    
    def add_constraint(
        self,
        fact: str,
        category: str,
        source: str,
        scene_id: Optional[int] = None,
        character_name: Optional[str] = None,
    ) -> ConstraintFact:
        """
        Add a new constraint fact (append-only).
        
        Args:
            fact: The constraint fact text
            category: One of "character_state", "world_rule", "plot_fact", "continuity"
            source: Which agent/phase added this
            scene_id: Scene this applies to (None = global)
            character_name: Character this applies to (if relevant)
            
        Returns:
            The created ConstraintFact
        """
        constraint = ConstraintFact(
            fact=fact,
            category=category,
            source=source,
            scene_id=scene_id,
            character_name=character_name,
        )
        self.facts.append(constraint)
        return constraint
    
    def get_constraints_for_scene(self, scene_id: int) -> List[ConstraintFact]:
        """Get all constraints relevant to a specific scene."""
        return [
            f for f in self.facts
            if f.scene_id is None or f.scene_id == scene_id
        ]
    
    def get_constraints_for_character(self, character_name: str) -> List[ConstraintFact]:
        """Get all constraints relevant to a specific character."""
        return [
            f for f in self.facts
            if f.character_name is None or f.character_name.lower() == character_name.lower()
        ]
    
    def get_constraints_by_category(self, category: str) -> List[ConstraintFact]:
        """Get all constraints of a specific category."""
        return [f for f in self.facts if f.category == category]
    
    def to_context_string(
        self,
        scene_id: Optional[int] = None,
        character_names: Optional[List[str]] = None,
        max_facts: int = 20,
    ) -> str:
        """
        Build a context string for injection into prompts.
        
        Args:
            scene_id: Filter to constraints relevant to this scene
            character_names: Filter to constraints relevant to these characters
            max_facts: Maximum number of facts to include
            
        Returns:
            Formatted string for prompt injection
        """
        relevant_facts = self.facts
        
        # Filter by scene if specified
        if scene_id is not None:
            relevant_facts = [
                f for f in relevant_facts
                if f.scene_id is None or f.scene_id == scene_id
            ]
        
        # Filter by characters if specified
        if character_names:
            char_names_lower = [c.lower() for c in character_names]
            relevant_facts = [
                f for f in relevant_facts
                if f.character_name is None or f.character_name.lower() in char_names_lower
            ]
        
        # Limit facts
        relevant_facts = relevant_facts[:max_facts]
        
        if not relevant_facts:
            return ""
        
        # Group by category
        by_category: Dict[str, List[str]] = {}
        for fact in relevant_facts:
            if fact.category not in by_category:
                by_category[fact.category] = []
            by_category[fact.category].append(fact.fact)
        
        # Build formatted string
        sections = []
        category_labels = {
            "character_state": "CHARACTER STATES",
            "world_rule": "WORLD RULES",
            "plot_fact": "PLOT FACTS",
            "continuity": "CONTINUITY",
        }
        
        for category, facts in by_category.items():
            label = category_labels.get(category, category.upper())
            facts_text = "\n".join(f"- {f}" for f in facts)
            sections.append(f"[{label}]\n{facts_text}")
        
        return "=== KEY CONSTRAINTS (DO NOT VIOLATE) ===\n" + "\n\n".join(sections)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "facts": [f.to_dict() for f in self.facts],
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "KeyConstraints":
        constraints = cls()
        for fact_data in data.get("facts", []):
            constraints.facts.append(ConstraintFact.from_dict(fact_data))
        return constraints


@dataclass
class BlackboardState:
    """
    Unified state object for the entire generation process.
    
    All agents read from and write to this shared state.
    The state is persisted to Supabase at checkpoints for recovery.
    
    This implements the Blackboard Pattern where:
    - State is the single source of truth
    - Agents autonomously decide what data they need
    - State changes are tracked for debugging
    """
    
    # Identifiers
    run_id: str = ""
    project_id: str = ""
    user_id: str = ""
    
    # Current phase
    phase: GenerationPhase = GenerationPhase.GENESIS
    
    # Phase data containers
    narrative: NarrativeData = field(default_factory=NarrativeData)
    characters: CharacterData = field(default_factory=CharacterData)
    worldbuilding: WorldbuildingData = field(default_factory=WorldbuildingData)
    outline: OutlineData = field(default_factory=OutlineData)
    advanced_planning: AdvancedPlanningData = field(default_factory=AdvancedPlanningData)
    drafting: DraftingData = field(default_factory=DraftingData)
    narrator: NarratorConfig = field(default_factory=NarratorConfig)
    
    # Key Constraints - IMMUTABLE facts that prevent Context Drift
    # These are NEVER compressed by summarization and ALWAYS injected during revisions
    key_constraints: KeyConstraints = field(default_factory=KeyConstraints)
    
    # Polished output
    polished_scenes: List[Dict[str, Any]] = field(default_factory=list)
    
    # Quality tracking
    quality_scores: Dict[int, float] = field(default_factory=dict)
    quality_feedback: Dict[int, List[str]] = field(default_factory=dict)
    
    # Execution metadata
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    last_checkpoint: Optional[datetime] = None
    error: Optional[str] = None
    
    # Change tracking for debugging
    _change_log: List[Dict[str, Any]] = field(default_factory=list)
    _dirty_fields: Set[str] = field(default_factory=set)
    
    def update(self, field_path: str, value: Any, source: str = "unknown") -> None:
        """
        Update a field in the state with change tracking.
        
        Args:
            field_path: Dot-separated path to the field (e.g., "narrative.themes")
            value: New value to set
            source: Source of the change (e.g., agent name)
        """
        parts = field_path.split(".")
        obj = self
        
        # Navigate to the parent object
        for part in parts[:-1]:
            if hasattr(obj, part):
                obj = getattr(obj, part)
            else:
                raise AttributeError(f"Invalid field path: {field_path}")
        
        # Set the value
        final_field = parts[-1]
        if hasattr(obj, final_field):
            old_value = getattr(obj, final_field)
            setattr(obj, final_field, value)
            
            # Track the change
            self._change_log.append({
                "timestamp": datetime.utcnow().isoformat(),
                "field": field_path,
                "source": source,
                "old_value_type": type(old_value).__name__,
                "new_value_type": type(value).__name__,
            })
            self._dirty_fields.add(field_path)
        else:
            raise AttributeError(f"Invalid field: {final_field}")
    
    def get(self, field_path: str, default: Any = None) -> Any:
        """
        Get a field value by path.
        
        Args:
            field_path: Dot-separated path to the field
            default: Default value if field not found
            
        Returns:
            Field value or default
        """
        parts = field_path.split(".")
        obj = self
        
        try:
            for part in parts:
                if hasattr(obj, part):
                    obj = getattr(obj, part)
                elif isinstance(obj, dict) and part in obj:
                    obj = obj[part]
                else:
                    return default
            return obj
        except Exception:
            return default
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert state to dictionary for persistence."""
        return {
            "run_id": self.run_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "phase": self.phase.value,
            "narrative": {
                "seed_idea": self.narrative.seed_idea,
                "narrative_possibility": self.narrative.narrative_possibility,
                "themes": self.narrative.themes,
                "tone": self.narrative.tone,
                "genre": self.narrative.genre,
                "target_audience": self.narrative.target_audience,
                "moral_compass": self.narrative.moral_compass,
            },
            "characters": {
                "characters": self.characters.characters,
                "protagonist": self.characters.protagonist,
                "antagonist": self.characters.antagonist,
                "supporting_cast": self.characters.supporting_cast,
            },
            "worldbuilding": {
                "worldbuilding": self.worldbuilding.worldbuilding,
                "geography": self.worldbuilding.geography,
                "cultures": self.worldbuilding.cultures,
                "rules": self.worldbuilding.rules,
                "history": self.worldbuilding.history,
            },
            "outline": {
                "outline": self.outline.outline,
                "scenes": self.outline.scenes,
                "structure": self.outline.structure,
                "estimated_word_count": self.outline.estimated_word_count,
            },
            "advanced_planning": {
                "motif_bible": self.advanced_planning.motif_bible,
                "contradiction_maps": self.advanced_planning.contradiction_maps,
                "emotional_beat_sheet": self.advanced_planning.emotional_beat_sheet,
                "complexity_checklist": self.advanced_planning.complexity_checklist,
            },
            "drafting": {
                "drafts": self.drafting.drafts,
                "current_scene": self.drafting.current_scene,
                "total_scenes": self.drafting.total_scenes,
                "critiques": self.drafting.critiques,
                "revision_counts": self.drafting.revision_counts,
            },
            "narrator": {
                "voice": self.narrator.voice,
                "perspective": self.narrator.perspective,
                "style": self.narrator.style,
                "design": self.narrator.design,
            },
            "key_constraints": self.key_constraints.to_dict(),
            "polished_scenes": self.polished_scenes,
            "quality_scores": self.quality_scores,
            "quality_feedback": self.quality_feedback,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "last_checkpoint": self.last_checkpoint.isoformat() if self.last_checkpoint else None,
            "error": self.error,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BlackboardState":
        """Create state from dictionary (for recovery)."""
        state = cls()
        
        state.run_id = data.get("run_id", "")
        state.project_id = data.get("project_id", "")
        state.user_id = data.get("user_id", "")
        state.phase = GenerationPhase(data.get("phase", "genesis"))
        
        # Restore narrative data
        narrative = data.get("narrative", {})
        state.narrative = NarrativeData(
            seed_idea=narrative.get("seed_idea", ""),
            narrative_possibility=narrative.get("narrative_possibility", {}),
            themes=narrative.get("themes", []),
            tone=narrative.get("tone", ""),
            genre=narrative.get("genre", ""),
            target_audience=narrative.get("target_audience", ""),
            moral_compass=narrative.get("moral_compass", "ambiguous"),
        )
        
        # Restore characters data
        characters = data.get("characters", {})
        state.characters = CharacterData(
            characters=characters.get("characters", []),
            protagonist=characters.get("protagonist"),
            antagonist=characters.get("antagonist"),
            supporting_cast=characters.get("supporting_cast", []),
        )
        
        # Restore worldbuilding data
        worldbuilding = data.get("worldbuilding", {})
        state.worldbuilding = WorldbuildingData(
            worldbuilding=worldbuilding.get("worldbuilding", {}),
            geography=worldbuilding.get("geography", []),
            cultures=worldbuilding.get("cultures", []),
            rules=worldbuilding.get("rules", []),
            history=worldbuilding.get("history", []),
        )
        
        # Restore outline data
        outline = data.get("outline", {})
        state.outline = OutlineData(
            outline=outline.get("outline", {}),
            scenes=outline.get("scenes", []),
            structure=outline.get("structure", ""),
            estimated_word_count=outline.get("estimated_word_count", 0),
        )
        
        # Restore advanced planning data
        advanced = data.get("advanced_planning", {})
        state.advanced_planning = AdvancedPlanningData(
            motif_bible=advanced.get("motif_bible", {}),
            contradiction_maps=advanced.get("contradiction_maps", {}),
            emotional_beat_sheet=advanced.get("emotional_beat_sheet", {}),
            complexity_checklist=advanced.get("complexity_checklist", {}),
        )
        
        # Restore drafting data
        drafting = data.get("drafting", {})
        state.drafting = DraftingData(
            drafts=drafting.get("drafts", []),
            current_scene=drafting.get("current_scene", 0),
            total_scenes=drafting.get("total_scenes", 0),
            critiques=drafting.get("critiques", {}),
            revision_counts=drafting.get("revision_counts", {}),
        )
        
        # Restore narrator config
        narrator = data.get("narrator", {})
        state.narrator = NarratorConfig(
            voice=narrator.get("voice", ""),
            perspective=narrator.get("perspective", ""),
            style=narrator.get("style", ""),
            design=narrator.get("design", {}),
        )
        
        # Restore key constraints (immutable facts)
        key_constraints_data = data.get("key_constraints", {})
        state.key_constraints = KeyConstraints.from_dict(key_constraints_data)
        
        state.polished_scenes = data.get("polished_scenes", [])
        state.quality_scores = data.get("quality_scores", {})
        state.quality_feedback = data.get("quality_feedback", {})
        
        # Restore timestamps
        if data.get("started_at"):
            state.started_at = datetime.fromisoformat(data["started_at"])
        if data.get("completed_at"):
            state.completed_at = datetime.fromisoformat(data["completed_at"])
        if data.get("last_checkpoint"):
            state.last_checkpoint = datetime.fromisoformat(data["last_checkpoint"])
        
        state.error = data.get("error")
        
        return state
    
    def get_dirty_fields(self) -> Set[str]:
        """Get fields that have been modified since last checkpoint."""
        return self._dirty_fields.copy()
    
    def clear_dirty_fields(self) -> None:
        """Clear dirty field tracking after checkpoint."""
        self._dirty_fields.clear()
    
    def get_change_log(self) -> List[Dict[str, Any]]:
        """Get the change log for debugging."""
        return self._change_log.copy()


@dataclass
class RunContext:
    """
    Execution context for a generation run.
    
    Provides access to:
    - Shared state (BlackboardState)
    - Services (Qdrant, Supabase, Redis)
    - Event emission
    - Tool execution
    
    Agents receive this context and can autonomously:
    - Read/write to shared state
    - Query vector databases
    - Emit events for UI updates
    - Call tools
    """
    
    # Core state
    state: BlackboardState
    
    # Service references (set during initialization)
    model_client: Any = None
    memory_service: Any = None  # QdrantMemoryService
    persistence_service: Any = None  # SupabasePersistenceService
    redis_client: Any = None
    
    # Callbacks
    event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
    pause_check: Optional[Callable[[], bool]] = None
    
    # Execution control
    is_cancelled: bool = False
    is_paused: bool = False
    
    # Tracing
    trace_enabled: bool = False
    
    def emit_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emit an event for UI updates."""
        if self.event_callback:
            self.event_callback(event_type, data)
    
    def check_pause(self) -> bool:
        """Check if execution should pause."""
        if self.pause_check:
            return self.pause_check()
        return self.is_paused
    
    def check_cancelled(self) -> bool:
        """Check if execution has been cancelled."""
        return self.is_cancelled
    
    async def checkpoint(self) -> None:
        """
        Save current state to Supabase for recovery.
        
        This should be called at phase boundaries and after
        significant state changes.
        """
        if not self.persistence_service:
            return
            
        self.state.last_checkpoint = datetime.utcnow()
        
        try:
            await self.persistence_service.store_run_artifact(
                project_id=self.state.project_id,
                run_id=self.state.run_id,
                phase="blackboard",
                artifact_type="state_snapshot",
                content=self.state.to_dict(),
            )
            self.state.clear_dirty_fields()
        except Exception as e:
            print(f"Failed to checkpoint state: {e}")
    
    async def restore_from_checkpoint(self, run_id: str) -> bool:
        """
        Restore state from the last checkpoint.
        
        Args:
            run_id: Run ID to restore
            
        Returns:
            True if restoration successful, False otherwise
        """
        if not self.persistence_service:
            return False
            
        try:
            artifacts = await self.persistence_service.get_run_artifacts(run_id)
            if "blackboard" in artifacts and "state_snapshot" in artifacts["blackboard"]:
                snapshot = artifacts["blackboard"]["state_snapshot"]
                restored_state = BlackboardState.from_dict(snapshot)
                
                # Copy restored state to current state
                self.state = restored_state
                return True
        except Exception as e:
            print(f"Failed to restore from checkpoint: {e}")
        
        return False
    
    async def search_characters(self, query: str, limit: int = 3) -> List[Dict[str, Any]]:
        """
        Search for relevant characters using vector similarity.
        
        This allows agents to autonomously retrieve character information
        instead of having it pre-loaded.
        """
        if not self.memory_service:
            return []
            
        try:
            return await self.memory_service.search_characters(
                project_id=self.state.project_id,
                query=query,
                limit=limit,
            )
        except Exception:
            return []
    
    async def search_worldbuilding(self, query: str, limit: int = 3) -> Dict[str, Any]:
        """
        Search for relevant worldbuilding elements using vector similarity.
        """
        if not self.memory_service:
            return {}
            
        try:
            return await self.memory_service.search_worldbuilding(
                project_id=self.state.project_id,
                query=query,
                limit=limit,
            )
        except Exception:
            return {}
    
    async def search_scenes(self, query: str, limit: int = 2) -> List[Dict[str, Any]]:
        """
        Search for relevant previous scenes using vector similarity.
        """
        if not self.memory_service:
            return []
            
        try:
            return await self.memory_service.search_scenes(
                project_id=self.state.project_id,
                query=query,
                limit=limit,
            )
        except Exception:
            return []
