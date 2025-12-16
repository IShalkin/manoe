"""
Pydantic data models for MANOE - derived from the Storyteller framework.
These models ensure enterprise-grade reliability with strict schema validation.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class MoralCompass(str, Enum):
    """
    Moral Compass configuration - influences theme and style throughout generation.
    Based on Storyteller framework Section 1.2.
    """
    ETHICAL = "Ethical"           # Virtue, Justice, clear good vs evil
    UNETHICAL = "Unethical"       # Darkness, Taboos, morally transgressive
    AMORAL = "Amoral"             # Non-judgmental observation
    AMBIGUOUS = "Ambiguous"       # Complex dilemmas, no easy answers
    USER_DEFINED = "UserDefined"  # Custom ethical framework


class Archetype(str, Enum):
    """
    Jungian archetypes for character design.
    Based on Storyteller framework Section 2.1.
    """
    HERO = "Hero"
    SHADOW = "Shadow"
    MENTOR = "Mentor"
    TRICKSTER = "Trickster"
    MAIDEN = "Maiden"
    WISE_OLD_MAN = "WiseOldMan"
    WISE_OLD_WOMAN = "WiseOldWoman"
    THRESHOLD_GUARDIAN = "ThresholdGuardian"
    HERALD = "Herald"
    SHAPESHIFTER = "Shapeshifter"


class NarrativeStructure(str, Enum):
    """
    Mythic structure options for plot mapping.
    Based on Storyteller framework Section 2.2.
    """
    HEROS_JOURNEY = "HerosJourney"
    THREE_ACT = "ThreeAct"
    FIVE_ACT = "FiveAct"
    NON_LINEAR = "NonLinear"
    CIRCULAR = "Circular"
    EPISODIC = "Episodic"


class ConflictType(str, Enum):
    """
    Three Great Conflicts from Storyteller framework.
    """
    HERO_VS_NATURE = "HeroVsNature"
    HERO_VS_SOCIETY = "HeroVsSociety"
    HERO_VS_SELF = "HeroVsSelf"


class ProjectStatus(str, Enum):
    """Project lifecycle status."""
    GENESIS = "genesis"
    CHARACTERS = "characters"
    OUTLINING = "outlining"
    DRAFTING = "drafting"
    CRITIQUE = "critique"
    REFINEMENT = "refinement"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# Input Models
# ============================================================================

class StoryProject(BaseModel):
    """
    Initial project configuration from user input.
    Based on Storyteller framework Section 1.
    """
    seed_idea: str = Field(
        ...,
        description="The 'What If?' question or initial concept that sparks the story",
        min_length=10
    )
    moral_compass: MoralCompass = Field(
        ...,
        description="Ethical framework that influences theme and style"
    )
    target_audience: str = Field(
        ...,
        description="Intended audience (age group, genre preferences, sensibilities)"
    )
    theme_core: List[str] = Field(
        default_factory=list,
        description="2-3 core themes to explore",
        max_length=5
    )
    tone_style_references: Optional[List[str]] = Field(
        default=None,
        description="Style references (e.g., 'Palahniuk-esque cynicism')"
    )
    custom_moral_system: Optional[str] = Field(
        default=None,
        description="Required if moral_compass is USER_DEFINED"
    )


# ============================================================================
# Character Models
# ============================================================================

class CopingMechanism(str, Enum):
    """Character coping mechanisms for psychological depth."""
    HUMOR = "Humor"
    DENIAL = "Denial"
    AGGRESSION = "Aggression"
    WITHDRAWAL = "Withdrawal"
    INTELLECTUALIZATION = "Intellectualization"
    PROJECTION = "Projection"
    SUBLIMATION = "Sublimation"
    COMPENSATION = "Compensation"


class CharacterProfile(BaseModel):
    """
    Detailed character profile with psychological depth.
    Based on Storyteller framework Section 3.1.
    """
    name: str = Field(..., description="Character name fitting personality and setting")
    archetype: Archetype = Field(..., description="Jungian archetype assignment")

    # Core Psychology
    core_motivation: str = Field(
        ...,
        description="Deep-seated desire driving the character"
    )
    inner_trap: str = Field(
        ...,
        description="Existential dilemma or psychological prison"
    )
    psychological_wound: str = Field(
        ...,
        description="Core trauma or formative negative experience"
    )
    coping_mechanism: CopingMechanism = Field(
        ...,
        description="How the character deals with stress and conflict"
    )
    deepest_fear: str = Field(
        ...,
        description="Ultimate fear that drives behavior"
    )
    breaking_point: str = Field(
        ...,
        description="What would cause the character to fundamentally change"
    )

    # External Attributes
    occupation_role: str = Field(..., description="Job, social role, or function")
    affiliations: List[str] = Field(
        default_factory=list,
        description="Groups, organizations, communities"
    )
    visual_signature: str = Field(
        ...,
        description="Defining visual detail (scar, tic, clothing item)"
    )

    # Goals
    public_goal: str = Field(..., description="What they openly strive for")
    hidden_goal: Optional[str] = Field(
        default=None,
        description="Secret objective, possibly unconscious"
    )

    # Background
    defining_moment: str = Field(
        ...,
        description="Pivotal past event that shaped who they are"
    )
    family_background: Optional[str] = Field(
        default=None,
        description="Family history and relationships"
    )

    # Skills and Quirks
    special_skill: Optional[str] = Field(
        default=None,
        description="Unique talent or ability"
    )
    quirks: List[str] = Field(
        default_factory=list,
        description="Unique mannerisms, habits, speech patterns"
    )

    # Story Role
    moral_stance: str = Field(
        ...,
        description="How character aligns with story's Moral Compass"
    )
    potential_arc: str = Field(
        ...,
        description="Preliminary character transformation trajectory"
    )


# ============================================================================
# Worldbuilding Models
# ============================================================================

class WorldGeography(BaseModel):
    """Geographic details of the story world."""
    location_name: str
    description: str
    climate: Optional[str] = None
    notable_features: List[str] = Field(default_factory=list)
    cultural_significance: Optional[str] = None


class WorldCulture(BaseModel):
    """Cultural details of the story world."""
    culture_name: str
    values: List[str]
    customs: List[str]
    taboos: List[str] = Field(default_factory=list)
    social_structure: Optional[str] = None


class WorldRule(BaseModel):
    """Rules and constraints of the story world."""
    rule_name: str
    description: str
    consequences_of_breaking: Optional[str] = None


class Worldbuilding(BaseModel):
    """
    Complete worldbuilding configuration.
    Based on Storyteller framework worldbuilding principles.
    """
    setting_name: str
    time_period: str
    geography: List[WorldGeography] = Field(default_factory=list)
    cultures: List[WorldCulture] = Field(default_factory=list)
    rules: List[WorldRule] = Field(default_factory=list)
    historical_events: List[str] = Field(default_factory=list)
    technology_level: Optional[str] = None
    magic_system: Optional[str] = None


# ============================================================================
# Plot Models
# ============================================================================

class EmotionalBeat(BaseModel):
    """Emotional trajectory for a scene."""
    initial_state: str = Field(..., description="Starting emotional state")
    climax: str = Field(..., description="Emotional turning point")
    final_state: str = Field(..., description="Ending emotional state")


class SceneOutline(BaseModel):
    """
    Scene-by-scene outline entry.
    Based on Storyteller framework Section 4.3.
    """
    scene_number: int
    title: str
    setting: str
    characters_present: List[str]

    # Conflict
    conflict_type: ConflictType
    conflict_description: str

    # Emotional Layer
    emotional_beat: EmotionalBeat

    # Subtext
    subtext_layer: str = Field(
        ...,
        description="Hidden intentions or fears not explicitly stated"
    )

    # Purpose
    plot_advancement: str = Field(
        ...,
        description="How this scene advances the plot"
    )
    character_development: Optional[str] = Field(
        default=None,
        description="Character growth or revelation in this scene"
    )

    # Technical
    estimated_word_count: int = Field(default=1500)


class PlotOutline(BaseModel):
    """
    Complete plot outline.
    Based on Storyteller framework Section 2.2 and 4.3.
    """
    project_id: str
    structure_type: NarrativeStructure
    total_scenes: int
    scenes: List[SceneOutline]

    # Structure Points
    inciting_incident_scene: int
    midpoint_scene: int
    climax_scene: int
    resolution_scene: int


# ============================================================================
# Draft Models
# ============================================================================

class SensoryDetails(BaseModel):
    """
    Sensory detail layering for scenes.
    Based on Storyteller framework Section 5.2.
    """
    sight: List[str] = Field(
        default_factory=list,
        description="Visual details (colors, shapes, light, shadow)"
    )
    sound: List[str] = Field(
        default_factory=list,
        description="Auditory details (environment, dialogue, music)"
    )
    smell: List[str] = Field(
        default_factory=list,
        description="Olfactory details"
    )
    taste: List[str] = Field(
        default_factory=list,
        description="Gustatory details"
    )
    touch: List[str] = Field(
        default_factory=list,
        description="Tactile details (textures, temperatures)"
    )
    internal: List[str] = Field(
        default_factory=list,
        description="Internal sensations (heartbeat, tension)"
    )


class DialogueEntry(BaseModel):
    """Dialogue with subtext annotation."""
    speaker: str
    spoken_text: str
    subtext: str = Field(
        ...,
        description="What the character is NOT saying"
    )
    action_beat: Optional[str] = Field(
        default=None,
        description="Physical action accompanying dialogue"
    )


class SceneDraft(BaseModel):
    """
    Complete scene draft output.
    Based on Storyteller framework Section 5.
    """
    scene_number: int
    title: str

    # Setting
    setting_description: str
    sensory_details: SensoryDetails

    # Content
    narrative_content: str = Field(
        ...,
        description="Full prose content of the scene"
    )
    dialogue_entries: List[DialogueEntry] = Field(default_factory=list)

    # Layers
    subtext_layer: str = Field(
        ...,
        description="What is NOT being said in this scene"
    )
    emotional_shift: str = Field(
        ...,
        description="Change in character/reader emotional state"
    )

    # Metadata
    word_count: int
    show_dont_tell_ratio: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Ratio of showing vs telling (target: >0.7)"
    )


# ============================================================================
# Critique Models
# ============================================================================

class CritiqueCategory(str, Enum):
    """Categories for artistic critique."""
    CLARITY = "Clarity"
    PACING = "Pacing"
    ENGAGEMENT = "Engagement"
    ORIGINALITY = "Originality"
    EMOTIONAL_RESONANCE = "EmotionalResonance"
    THEMATIC_SUBTLETY = "ThematicSubtlety"
    STYLISTIC_VOICE = "StylisticVoice"
    CHARACTER_ARC = "CharacterArc"
    SUBTEXT = "Subtext"
    DIALOGUE = "Dialogue"
    SHOW_DONT_TELL = "ShowDontTell"
    SENSORY_DENSITY = "SensoryDensity"


class CritiqueFeedback(BaseModel):
    """
    Individual critique feedback item.
    Based on Storyteller framework Section 6.1.
    """
    category: CritiqueCategory
    score: int = Field(..., ge=1, le=10, description="Score from 1-10")
    feedback: str = Field(..., description="Specific feedback")
    suggestions: List[str] = Field(
        default_factory=list,
        description="Actionable improvement suggestions"
    )
    line_references: List[int] = Field(
        default_factory=list,
        description="Specific line numbers referenced"
    )


class SceneCritique(BaseModel):
    """
    Complete critique for a scene draft.
    Based on Storyteller framework Section 6.1.
    """
    scene_number: int
    overall_score: float = Field(..., ge=1.0, le=10.0)
    approved: bool

    feedback_items: List[CritiqueFeedback]

    # Summary
    strengths: List[str]
    weaknesses: List[str]

    # Revision Requirements
    revision_required: bool
    revision_focus: Optional[List[str]] = Field(
        default=None,
        description="Specific areas to focus on in revision"
    )

    # Deepening Checkpoint
    creative_risk_assessment: str = Field(
        ...,
        description="Have enough creative risks been taken?"
    )
    psychological_alignment: str = Field(
        ...,
        description="Do character choices align with psychological depth?"
    )
    complexity_assessment: str = Field(
        ...,
        description="Does complexity enhance or obscure themes?"
    )


# ============================================================================
# Output Models
# ============================================================================

class NarrativePossibility(BaseModel):
    """
    Output from Architect Agent - narrative possibility.
    Based on Storyteller framework Section 1.4.
    """
    plot_summary: str = Field(
        ...,
        description="Brief summary of the plot"
    )
    setting_description: str = Field(
        ...,
        description="Description of the story setting"
    )
    main_conflict: str = Field(
        ...,
        description="Central conflict of the story"
    )
    potential_characters: List[str] = Field(
        ...,
        description="Character types needed for the story"
    )
    possible_twists: List[str] = Field(
        default_factory=list,
        description="Potential plot twists or turns"
    )
    thematic_elements: List[str] = Field(
        ...,
        description="Themes to be explored"
    )
    moral_compass_application: str = Field(
        ...,
        description="How the moral compass will be applied"
    )


# ============================================================================
# Event Models
# ============================================================================

class AgentEvent(BaseModel):
    """Event emitted by agents for audit logging."""
    project_id: str
    agent_name: str
    action: str
    input_summary: str
    output_summary: str
    token_usage: dict
    duration_ms: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class JobPayload(BaseModel):
    """Payload for Redis job queue."""
    job_id: str
    project_id: str
    phase: ProjectStatus
    input_data: dict
    created_at: datetime = Field(default_factory=datetime.utcnow)
    retry_count: int = 0
    max_retries: int = 3


# ============================================================================
# Output Format Models (PDF Section 8.2)
# ============================================================================

class OutputFormat(str, Enum):
    """Output format options for story generation."""
    SHORT_STORY = "short_story"
    NOVEL_CHAPTER = "novel_chapter"
    SCREENPLAY = "screenplay"
    NOVELLA = "novella"


class OutputFormatConfig(BaseModel):
    """Configuration for output format."""
    format: OutputFormat = Field(default=OutputFormat.SHORT_STORY)
    target_word_count: Optional[int] = Field(
        default=None,
        description="Target word count for the output"
    )
    scene_count: Optional[int] = Field(
        default=None,
        description="Target number of scenes"
    )


# ============================================================================
# Reader Sensibilities Models (PDF Section 1.3)
# ============================================================================

class ContentSensitivity(str, Enum):
    """Content sensitivity levels."""
    NONE = "none"
    MILD = "mild"
    MODERATE = "moderate"
    EXPLICIT = "explicit"


class ReaderSensibilities(BaseModel):
    """
    Reader sensibilities and content warnings configuration.
    Based on Storyteller framework Section 1.3.
    """
    violence: ContentSensitivity = Field(
        default=ContentSensitivity.MODERATE,
        description="Violence content level"
    )
    sexual_content: ContentSensitivity = Field(
        default=ContentSensitivity.MILD,
        description="Sexual content level"
    )
    profanity: ContentSensitivity = Field(
        default=ContentSensitivity.MODERATE,
        description="Profanity/language level"
    )
    drug_use: ContentSensitivity = Field(
        default=ContentSensitivity.MILD,
        description="Drug/substance use content level"
    )
    dark_themes: ContentSensitivity = Field(
        default=ContentSensitivity.MODERATE,
        description="Dark themes (death, trauma, etc.) level"
    )
    trigger_warnings: List[str] = Field(
        default_factory=list,
        description="Specific content warnings to include"
    )


# ============================================================================
# Character Relationship Models
# ============================================================================

class RelationshipType(str, Enum):
    """Types of character relationships."""
    ALLY = "ally"
    ENEMY = "enemy"
    RIVAL = "rival"
    MENTOR = "mentor"
    PROTEGE = "protege"
    LOVER = "lover"
    FAMILY = "family"
    NEUTRAL = "neutral"
    COMPLEX = "complex"


class CharacterRelationship(BaseModel):
    """
    Relationship between two characters.
    Used for character relationship mapping visualization.
    """
    source_character: str = Field(..., description="Name of the source character")
    target_character: str = Field(..., description="Name of the target character")
    relationship_type: RelationshipType = Field(..., description="Type of relationship")
    description: str = Field(..., description="Description of the relationship")
    dynamics: Optional[str] = Field(
        default=None,
        description="How the relationship evolves or creates tension"
    )
    tension_level: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Tension level in the relationship (1-10)"
    )


class CharacterRelationshipMap(BaseModel):
    """Complete character relationship map for a story."""
    project_id: str
    characters: List[str] = Field(..., description="List of character names")
    relationships: List[CharacterRelationship] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Motif Layer Models (PDF Section 3.5.2)
# ============================================================================

class SymbolEntry(BaseModel):
    """A symbolic element in the story."""
    symbol: str = Field(..., description="The symbol or motif")
    meaning: str = Field(..., description="What the symbol represents")
    first_appearance: Optional[str] = Field(
        default=None,
        description="Scene or context of first appearance"
    )
    evolution: Optional[str] = Field(
        default=None,
        description="How the symbol evolves through the story"
    )


class CharacterMotif(BaseModel):
    """Motif associated with a specific character."""
    character_name: str
    motifs: List[str] = Field(default_factory=list)
    visual_metaphors: List[str] = Field(default_factory=list)


class SceneMotifTarget(BaseModel):
    """Motif targets for a specific scene."""
    scene_number: int
    scene_title: Optional[str] = None
    motifs_to_include: List[str] = Field(default_factory=list)
    symbolic_actions: List[str] = Field(default_factory=list)


class MotifBible(BaseModel):
    """
    Complete motif bible for symbolic/thematic consistency.
    Based on Storyteller framework Section 3.5.2.
    """
    project_id: str
    core_symbols: List[SymbolEntry] = Field(
        default_factory=list,
        description="Primary symbols that recur throughout the story"
    )
    visual_metaphors: List[str] = Field(
        default_factory=list,
        description="Visual metaphors used in the narrative"
    )
    character_motifs: List[CharacterMotif] = Field(
        default_factory=list,
        description="Motifs associated with each character"
    )
    structural_motifs: List[str] = Field(
        default_factory=list,
        description="Motifs tied to story structure (beginning, middle, end)"
    )
    scene_targets: List[SceneMotifTarget] = Field(
        default_factory=list,
        description="Per-scene motif targets for the Writer"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Deepening Checkpoint Models (PDF Section 6.1)
# ============================================================================

class CheckpointCriterion(BaseModel):
    """Individual criterion for a deepening checkpoint."""
    name: str
    score: int = Field(..., ge=1, le=10)
    feedback: str


class DeepeningCheckpointResult(BaseModel):
    """
    Result of a deepening checkpoint evaluation.
    Based on Storyteller framework Section 6.1.
    """
    checkpoint_type: str = Field(
        ...,
        description="Type of checkpoint (inciting_incident, midpoint, climax, resolution)"
    )
    scene_number: int
    overall_score: float = Field(..., ge=1.0, le=10.0)
    passed: bool
    criteria: List[CheckpointCriterion] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    evaluated_at: datetime = Field(default_factory=datetime.utcnow)
