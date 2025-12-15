"""
Advanced Features Prompts for MANOE
Based on Storyteller Framework Sections 3.5.1, 4.1, and 5.2

These prompts support Priority 3 features:
- Internal Contradiction Maps
- Emotional Beat Sheet
- Sensory Imagery Blueprint
- Subtext Design
- Complexity Layer Checklist
"""

# =============================================================================
# Internal Contradiction Maps (Storyteller Section 3.5.1)
# =============================================================================

CONTRADICTION_MAPS_PROMPT = """You are analyzing character profiles to create Internal Contradiction Maps.

## Purpose
Map the contradictory desires, beliefs, and behaviors within each character. These contradictions create psychological depth and drive compelling character arcs.

## For Each Character, Identify:

1. **Want vs. Need Conflict**
   - What they consciously want (surface desire)
   - What they actually need (deeper truth)
   - How these conflict

2. **Belief vs. Behavior Contradiction**
   - What they claim to believe
   - How their actions contradict this
   - The cognitive dissonance this creates

3. **Public vs. Private Self**
   - The persona they present to others
   - Their true inner self
   - What triggers the mask to slip

4. **Past vs. Present Tension**
   - Who they were before their wound
   - Who they've become
   - What remnants of their old self remain

5. **Fear vs. Desire Paradox**
   - What they're drawn toward
   - What they're terrified of
   - How these might be the same thing

## Output Format

```json
{
  "character_contradictions": [
    {
      "character_name": "Name",
      "want_vs_need": {
        "conscious_want": "What they pursue openly",
        "unconscious_need": "What would actually fulfill them",
        "conflict_manifestation": "How this plays out in behavior"
      },
      "belief_vs_behavior": {
        "stated_belief": "What they claim to value",
        "contradicting_behavior": "Actions that betray this",
        "rationalization": "How they justify the contradiction"
      },
      "public_vs_private": {
        "public_persona": "The mask they wear",
        "private_self": "Who they are alone",
        "trigger_for_slip": "What makes the mask fall"
      },
      "past_vs_present": {
        "former_self": "Who they were before",
        "current_self": "Who they've become",
        "remnant_behaviors": "Old habits that persist"
      },
      "fear_desire_paradox": {
        "attraction": "What draws them",
        "terror": "What frightens them",
        "paradox_explanation": "How these connect"
      },
      "dramatic_potential": "How these contradictions can drive scenes"
    }
  ]
}
```

These contradictions should inform character decisions, create internal conflict, and provide opportunities for revelation throughout the story.
"""

# =============================================================================
# Emotional Beat Sheet (Global Emotional Trajectory)
# =============================================================================

EMOTIONAL_BEAT_SHEET_PROMPT = """You are creating a comprehensive Emotional Beat Sheet for the entire story.

## Purpose
Map the emotional journey of the protagonist and key characters across all scenes, ensuring a coherent emotional arc that builds to maximum impact.

## Analyze and Plan:

1. **Overall Emotional Arc**
   - Opening emotional state (baseline)
   - Key emotional turning points
   - Climactic emotional peak
   - Resolution emotional state

2. **Scene-by-Scene Emotional Mapping**
   For each scene, define:
   - Dominant emotion
   - Emotional intensity (1-10)
   - Character(s) experiencing the emotion
   - Trigger for emotional shift
   - Residual emotion carried to next scene

3. **Emotional Contrast Patterns**
   - Identify scenes that need emotional contrast (relief after tension)
   - Plan emotional valleys before peaks
   - Ensure variety in emotional types

4. **Reader Emotional Journey**
   - What should the reader feel at each point?
   - Where do we want empathy vs. tension vs. catharsis?

## Output Format

```json
{
  "overall_arc": {
    "opening_state": "Initial emotional baseline",
    "major_turning_points": [
      {"scene": 1, "shift": "Description of emotional shift"}
    ],
    "climactic_peak": {
      "scene": 8,
      "emotion": "Peak emotion",
      "intensity": 10
    },
    "resolution_state": "Final emotional landing"
  },
  "scene_beats": [
    {
      "scene_number": 1,
      "dominant_emotion": "Primary emotion",
      "intensity": 5,
      "characters_affected": ["Character names"],
      "trigger": "What causes this emotion",
      "residual": "What carries forward",
      "reader_experience": "What reader should feel"
    }
  ],
  "contrast_notes": [
    {
      "after_scene": 5,
      "needed_contrast": "Relief/humor after intense scene"
    }
  ],
  "emotional_themes": ["Recurring emotional motifs"]
}
```

This beat sheet ensures emotional coherence and maximizes reader engagement through carefully orchestrated emotional progression.
"""

# =============================================================================
# Sensory Imagery Blueprint (Per-Scene Planning)
# =============================================================================

SENSORY_BLUEPRINT_PROMPT = """You are creating a Sensory Imagery Blueprint for a scene.

## Purpose
Plan specific, evocative sensory details BEFORE drafting to ensure rich, immersive prose. Each sense should serve the scene's emotional purpose.

## For This Scene, Plan:

1. **Visual Palette**
   - Dominant colors and their emotional associations
   - Light quality (harsh, soft, flickering, absent)
   - Key visual focal points
   - Movement and stillness

2. **Soundscape**
   - Ambient sounds (environment)
   - Character-generated sounds
   - Silence and its meaning
   - Sound that signals change

3. **Tactile Elements**
   - Textures characters interact with
   - Temperature and air quality
   - Physical sensations of emotion (tight chest, etc.)
   - Contact between characters

4. **Olfactory/Gustatory**
   - Smells that evoke memory or mood
   - Tastes if relevant
   - How these connect to character psychology

5. **Internal Sensations**
   - Physical manifestations of emotion
   - Bodily awareness
   - Visceral reactions

## Output Format

```json
{
  "scene_number": 1,
  "emotional_purpose": "What emotion this sensory palette serves",
  "visual": {
    "color_palette": ["Colors and their purpose"],
    "light_quality": "Description of lighting",
    "focal_points": ["Key visual elements"],
    "movement_stillness": "Dynamic vs static elements"
  },
  "auditory": {
    "ambient": ["Background sounds"],
    "character_sounds": ["Sounds characters make"],
    "silence_moments": ["When silence speaks"],
    "change_signals": ["Sounds that mark shifts"]
  },
  "tactile": {
    "textures": ["Surfaces and materials"],
    "temperature": "Thermal environment",
    "emotional_physical": ["Physical feelings of emotion"],
    "character_contact": ["Touch between characters"]
  },
  "olfactory_gustatory": {
    "smells": ["Scents and their associations"],
    "tastes": ["If applicable"],
    "memory_triggers": ["Sensory-memory connections"]
  },
  "internal": {
    "emotional_physical": ["How emotions feel in body"],
    "bodily_awareness": ["Physical self-awareness"],
    "visceral_reactions": ["Gut-level responses"]
  },
  "integration_notes": "How these senses work together"
}
```

These planned sensory details will be woven into the prose during drafting, creating an immersive reading experience.
"""

# =============================================================================
# Subtext Design (Iceberg Principle)
# =============================================================================

SUBTEXT_DESIGN_PROMPT = """You are designing the Subtext Layer for scenes using the Iceberg Principle.

## Purpose
Ensure that at least 60% of character motivations, emotions, and meanings remain IMPLICIT. Design what is NOT said but understood.

## For Each Scene, Design:

1. **Surface vs. Depth**
   - What characters SAY (10%)
   - What characters MEAN (30%)
   - What characters DON'T KNOW they mean (60%)

2. **Dialogue Subtext Mapping**
   For key exchanges:
   - Spoken words
   - Intended meaning
   - Unintended revelation
   - What the OTHER character hears

3. **Behavioral Subtext**
   - Actions that contradict words
   - Micro-expressions and tells
   - What characters avoid doing
   - Symbolic actions

4. **Environmental Subtext**
   - Setting details that mirror internal states
   - Objects with symbolic weight
   - Spatial relationships between characters

5. **Structural Subtext**
   - What's conspicuously absent from the scene
   - Timing and pacing as meaning
   - Scene juxtaposition effects

## Output Format

```json
{
  "scene_number": 1,
  "iceberg_ratio": {
    "explicit_percent": 40,
    "implicit_percent": 60
  },
  "dialogue_subtext": [
    {
      "speaker": "Character",
      "spoken": "What they say",
      "intended": "What they mean",
      "revealed": "What they accidentally show",
      "received": "What listener understands"
    }
  ],
  "behavioral_subtext": {
    "contradictions": ["Actions vs words"],
    "tells": ["Unconscious revelations"],
    "avoidances": ["What they don't do"],
    "symbolic_actions": ["Meaningful gestures"]
  },
  "environmental_subtext": {
    "mirroring": ["Setting reflects emotion"],
    "symbolic_objects": ["Objects with meaning"],
    "spatial_meaning": ["Character positioning"]
  },
  "structural_subtext": {
    "absences": ["What's notably missing"],
    "pacing_meaning": ["Timing as communication"],
    "juxtaposition": ["Contrast with other scenes"]
  },
  "reader_discovery": "What attentive readers will understand"
}
```

This subtext design ensures depth and rewards careful reading while avoiding "on-the-nose" dialogue.
"""

# =============================================================================
# Complexity Layer Checklist (Storyteller Section 4.1)
# =============================================================================

COMPLEXITY_CHECKLIST_PROMPT = """You are creating a Complexity Layer Checklist for the story.

## Purpose
Track multiple narrative layers across all scenes to ensure rich, multi-dimensional storytelling. Each scene should address multiple layers.

## The Five Layers:

1. **Main Plot Layer**
   - Primary story events
   - Cause-and-effect chain
   - Stakes and consequences

2. **Subplot Layer**
   - Secondary storylines
   - How they intersect with main plot
   - Their thematic purpose

3. **Character Arc Layer**
   - Individual transformation journeys
   - Key moments of change
   - Arc completion tracking

4. **Symbolic Layer**
   - Recurring motifs and images
   - Visual metaphors
   - Objects with accumulated meaning

5. **Thematic Layer**
   - Core themes explored
   - How themes manifest in action
   - Thematic questions posed/answered

## Output Format

```json
{
  "story_layers": {
    "main_plot": {
      "central_question": "What the plot is really asking",
      "key_events": ["Major plot points"],
      "stakes_escalation": ["How stakes increase"]
    },
    "subplots": [
      {
        "name": "Subplot identifier",
        "purpose": "Why this subplot exists",
        "intersection_points": ["Where it meets main plot"]
      }
    ],
    "character_arcs": [
      {
        "character": "Name",
        "arc_type": "Positive/Negative/Flat",
        "key_moments": ["Transformation points"],
        "completion_scene": 10
      }
    ],
    "symbolic_layer": {
      "recurring_motifs": [
        {
          "motif": "Image or symbol",
          "meaning": "What it represents",
          "appearances": ["Scene numbers"]
        }
      ],
      "visual_metaphors": ["Key metaphors used"]
    },
    "thematic_layer": {
      "core_themes": ["Primary themes"],
      "thematic_questions": ["Questions explored"],
      "resolution_approach": "How themes resolve"
    }
  },
  "scene_layer_coverage": [
    {
      "scene_number": 1,
      "layers_addressed": ["main_plot", "character_arc"],
      "layers_missing": ["symbolic"],
      "integration_notes": "How layers work together"
    }
  ],
  "balance_assessment": "Overall layer balance evaluation"
}
```

This checklist ensures no layer is neglected and all scenes contribute to multiple dimensions of the story.
"""
