"""
Advanced Features Prompts for MANOE
Based on Storyteller Framework Sections 1.4, 3.2, 3.5.1, 4.1, and 5.2

These prompts support Priority 3 features:
- Narrative Possibilities Branching (Section 1.4)
- Narrator Design (Section 3.2)
- Internal Contradiction Maps
- Emotional Beat Sheet
- Sensory Imagery Blueprint
- Subtext Design
- Complexity Layer Checklist
"""

# =============================================================================
# Narrator Design (Storyteller Section 3.2)
# =============================================================================

NARRATOR_DESIGN_PROMPT = """You are designing the Narrator for this story based on the Storyteller Framework Section 3.2.

## Purpose
Create a comprehensive narrator design that goes beyond basic POV selection to establish a distinctive narrative voice that serves the story's themes and emotional goals.

## User Preferences (if provided)
These are the user's initial preferences. Use them as a starting point but expand with detailed voice characteristics:
- POV Preference: {pov_preference}
- Reliability Preference: {reliability_preference}
- Stance Preference: {stance_preference}

## Design Elements

1. **Point of View (POV)**
   - First Person (I/We): Intimate, limited to narrator's knowledge, creates immediate connection
   - Third Person Limited: Follows one character's perspective, balances intimacy with flexibility
   - Third Person Omniscient: All-knowing, can access any character's thoughts, god-like perspective
   - Second Person (You): Immersive, experimental, reader as protagonist

2. **Narrator Reliability**
   - Reliable: Trustworthy narrator who presents events accurately
   - Unreliable: Biased, limited, or deceptive narrator - reader must question the narrative
   - If unreliable, specify: What does the narrator misperceive? What do they hide? Why?

3. **Emotional Stance**
   - Objective: Reports events without judgment or commentary
   - Judgmental: Comments on and evaluates characters and events
   - Sympathetic: Empathizes with characters, emotionally engaged
   - Ironic: Maintains distance through wit or detachment

4. **Voice Characteristics** (CRITICAL - this is what makes the narrator unique)
   - Vocabulary level and style (formal, colloquial, poetic, sparse)
   - Sentence rhythm (long flowing sentences, short punchy ones, varied)
   - Distinctive verbal tics or patterns
   - Cultural/temporal markers in language
   - Emotional temperature (warm, cold, passionate, detached)

5. **Narrative Techniques**
   - Direct address to reader (if any)
   - Use of present vs past tense
   - Handling of time (linear, non-linear, flashbacks)
   - Interior monologue style
   - Dialogue attribution style

6. **Relationship to Characters**
   - Distance from protagonist (intimate, observational, distant)
   - Access to other characters' interiority
   - How the narrator reveals character thoughts

## Output Format

```json
{{
  "pov": {{
    "type": "first_person|third_person_limited|third_person_omniscient|second_person",
    "focal_character": "Name of POV character (if applicable)",
    "rationale": "Why this POV serves the story"
  }},
  "reliability": {{
    "level": "reliable|unreliable",
    "if_unreliable": {{
      "type": "naive|self-deceiving|deliberately_deceptive|mentally_unstable",
      "blind_spots": ["What the narrator cannot or will not see"],
      "hidden_truths": ["What the narrator conceals"],
      "reader_clues": ["How readers can detect unreliability"]
    }}
  }},
  "stance": {{
    "primary": "objective|judgmental|sympathetic|ironic",
    "emotional_investment": "How much the narrator cares about events",
    "moral_position": "Narrator's implicit moral framework"
  }},
  "voice_characteristics": {{
    "vocabulary": {{
      "level": "simple|moderate|sophisticated|literary",
      "style": "formal|colloquial|poetic|sparse|ornate",
      "distinctive_words": ["Words or phrases the narrator favors"]
    }},
    "sentence_structure": {{
      "rhythm": "Description of sentence patterns",
      "average_length": "short|medium|long|varied",
      "signature_patterns": ["Distinctive syntactic choices"]
    }},
    "verbal_tics": ["Recurring phrases or patterns"],
    "cultural_markers": ["Language that places narrator in time/place"],
    "emotional_temperature": "warm|cool|passionate|detached|volatile"
  }},
  "narrative_techniques": {{
    "tense": "past|present",
    "direct_address": "Whether and how narrator addresses reader",
    "time_handling": "linear|non-linear|fragmented",
    "interior_monologue": "How thoughts are presented",
    "dialogue_style": "How dialogue is attributed and formatted"
  }},
  "character_relationship": {{
    "protagonist_distance": "intimate|close|observational|distant",
    "interiority_access": "Which characters' thoughts we can access",
    "revelation_style": "How character psychology is revealed"
  }},
  "sample_voice": "A 2-3 sentence example demonstrating this narrator's voice",
  "integration_notes": "How this narrator design serves the story's themes and goals"
}}
```

Design a narrator that will bring this specific story to life with a distinctive, memorable voice.
"""

# =============================================================================
# Narrative Possibilities Branching (Storyteller Section 1.4)
# =============================================================================

NARRATIVE_POSSIBILITIES_PROMPT = """You are the Architect Agent generating MULTIPLE Narrative Possibilities for the user to choose from.

## Purpose
Instead of generating a single narrative direction, create 3-5 DISTINCT narrative possibilities that explore different interpretations of the seed idea. Each possibility should be viable and compelling, but take the story in meaningfully different directions.

## Project Configuration
- Seed Idea: {seed_idea}
- Moral Compass: {moral_compass}
- Target Audience: {target_audience}
- Core Themes: {theme_core}
- Style References: {tone_style_references}
{custom_moral_system_section}

## Requirements for Each Possibility

Each narrative possibility must:
1. Be a COMPLETE, viable story direction (not a fragment)
2. Differ MEANINGFULLY from the others (not just minor variations)
3. Apply the same Moral Compass consistently
4. Be appropriate for the Target Audience
5. Have room for character development and thematic exploration

## Differentiation Strategies

Create variety by exploring different:
- **Genre Interpretations**: Same seed, different genre lens (thriller vs. drama vs. literary)
- **Conflict Types**: Hero vs. Nature, Hero vs. Society, Hero vs. Self
- **Tonal Approaches**: Dark and serious vs. hopeful vs. bittersweet
- **Structural Choices**: Linear vs. non-linear, single POV vs. multiple
- **Thematic Emphasis**: Which themes take center stage
- **Setting Variations**: Same concept in different times/places
- **Character Focus**: Different protagonist choices or relationships

## Output Format

```json
{{
  "narrative_possibilities": [
    {{
      "id": 1,
      "title": "Short evocative title for this direction",
      "genre_approach": "Primary genre/tone",
      "plot_summary": "A compelling 2-3 paragraph summary of this story direction",
      "setting_description": "Detailed description of when and where",
      "main_conflict": "The central conflict driving this version",
      "conflict_type": "vs_nature|vs_society|vs_self|vs_other",
      "potential_characters": ["List of character types needed"],
      "possible_twists": ["Potential plot twists"],
      "thematic_elements": ["Core themes (2-3 maximum)"],
      "moral_compass_application": "How the ethical framework shapes this version",
      "unique_appeal": "What makes this direction compelling and distinct",
      "estimated_tone": "dark|hopeful|bittersweet|intense|contemplative"
    }},
    {{
      "id": 2,
      ...
    }},
    ...
  ],
  "recommendation": {{
    "preferred_id": 1,
    "rationale": "Why this possibility best serves the seed idea and user preferences"
  }}
}}
```

## Quality Standards

- Each possibility should feel like a REAL story someone would want to read
- Avoid clichés and predictable premises
- Ensure psychological depth potential in each direction
- Make the choices genuinely difficult - all options should be appealing
- The recommendation should be thoughtful but the user makes the final choice

Generate 3-5 distinct narrative possibilities now.
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

# =============================================================================
# Deepening Checkpoints (Storyteller Section 6.1)
# =============================================================================

DEEPENING_CHECKPOINT_PROMPT = """You are evaluating a scene at a critical structural checkpoint in the narrative.

## Checkpoint Type: {checkpoint_type}

### Checkpoint Definitions:

**Inciting Incident** (typically Scene 2-3):
- Must disrupt the protagonist's ordinary world
- Should introduce or hint at the central conflict
- Must create a clear "point of no return" feeling
- Should establish stakes that matter to the protagonist

**Midpoint** (typically 50% through):
- Must represent a major shift in the story's direction
- Should raise stakes significantly
- Often includes a revelation or reversal
- Protagonist should move from reactive to proactive (or vice versa)

**Climax** (typically 80-90% through):
- Must be the highest point of tension
- Should force the protagonist to make their defining choice
- All major conflicts should converge here
- Thematic questions should reach their peak expression

**Resolution** (final scenes):
- Must provide emotional closure
- Should show the consequences of the climax
- Character arcs should reach completion
- Thematic statement should be clear (even if ambiguous)

## Scene Being Evaluated

**Scene Number:** {scene_number}
**Scene Title:** {scene_title}
**Scene Content:**
{scene_content}

## Story Context

**Narrative Foundation:**
{narrative_summary}

**Character Arcs in Progress:**
{character_arcs}

**Core Themes:**
{themes}

**Previous Key Events:**
{previous_events}

## Evaluation Criteria

Rate each criterion from 1-10 and provide specific feedback:

1. **Structural Function** - Does this scene fulfill its checkpoint role?
2. **Stakes Escalation** - Are stakes appropriate for this point in the story?
3. **Character Agency** - Do characters drive the action through meaningful choices?
4. **Thematic Resonance** - Does the scene reinforce or explore core themes?
5. **Emotional Impact** - Does the scene deliver appropriate emotional weight?
6. **Causality** - Does the scene flow logically from previous events?
7. **Setup/Payoff** - Does the scene pay off earlier setups or create new ones?

## Output Format

```json
{{
  "checkpoint_type": "{checkpoint_type}",
  "scene_number": {scene_number},
  "passed": true/false,
  "overall_score": 7.5,
  "criteria_scores": {{
    "structural_function": {{
      "score": 8,
      "feedback": "Specific feedback on how well the scene fulfills its structural role"
    }},
    "stakes_escalation": {{
      "score": 7,
      "feedback": "Assessment of stakes at this point"
    }},
    "character_agency": {{
      "score": 8,
      "feedback": "How well characters drive the action"
    }},
    "thematic_resonance": {{
      "score": 7,
      "feedback": "Connection to core themes"
    }},
    "emotional_impact": {{
      "score": 8,
      "feedback": "Emotional effectiveness"
    }},
    "causality": {{
      "score": 9,
      "feedback": "Logical flow from previous events"
    }},
    "setup_payoff": {{
      "score": 7,
      "feedback": "Use of setups and payoffs"
    }}
  }},
  "strengths": [
    "What the scene does well at this checkpoint"
  ],
  "areas_for_improvement": [
    "Specific suggestions for strengthening the scene"
  ],
  "checkpoint_specific_notes": "Notes specific to this checkpoint type",
  "revision_priority": "high|medium|low",
  "suggested_revisions": [
    {{
      "issue": "Specific issue identified",
      "suggestion": "Concrete suggestion for improvement",
      "priority": "high|medium|low"
    }}
  ]
}}
```

## Passing Threshold

A scene PASSES the checkpoint if:
- Overall score >= 7.0
- No individual criterion scores below 5
- Structural function score >= 7

Evaluate the scene thoroughly and provide actionable feedback.
"""

# =============================================================================
# Symbolic/Motif Layer Planning (Storyteller Section 3.5.2)
# =============================================================================

SYMBOLIC_MOTIF_LAYER_PROMPT = """You are creating a comprehensive Symbolic/Motif Layer Plan - a "Motif Bible" for the story.

## Purpose
Design the symbolic and motif layer that will run throughout the narrative, creating deeper meaning and thematic resonance. This includes visual metaphors, recurring symbols, and per-scene motif targets.

## Story Context

**Narrative Foundation:**
{narrative_summary}

**Core Themes:**
{themes}

**Characters:**
{characters}

**Plot Outline:**
{outline_summary}

## Create the Motif Bible

### 1. Core Symbols
Identify 3-5 central symbols that embody the story's themes:
- What concrete object/image represents each theme?
- How does the symbol's meaning evolve through the story?
- What emotional associations does it carry?

### 2. Visual Metaphor System
Design recurring visual metaphors:
- Light/darkness patterns and their meaning
- Color symbolism throughout the narrative
- Spatial metaphors (height, depth, enclosure, openness)
- Natural imagery (weather, seasons, animals, plants)
- Object symbolism (doors, mirrors, water, fire, etc.)

### 3. Character-Linked Motifs
Assign specific motifs to characters:
- What image/symbol is associated with each major character?
- How does their motif reflect their arc?
- When do character motifs intersect or contrast?

### 4. Structural Motifs
Plan motifs that mark structural beats:
- Opening image that establishes the world
- Midpoint mirror/reversal imagery
- Climax convergence of motifs
- Closing image that echoes or transforms the opening

### 5. Per-Scene Motif Targets
For each scene, specify which motifs should appear and how.

## Output Format

```json
{{
  "motif_bible": {{
    "core_symbols": [
      {{
        "symbol": "Name/description of symbol",
        "represents": "What theme/concept it embodies",
        "evolution": {{
          "introduction": "How it first appears",
          "development": "How meaning deepens",
          "transformation": "Final form/meaning"
        }},
        "emotional_register": "What feelings it evokes",
        "key_scenes": [1, 5, 10]
      }}
    ],
    "visual_metaphor_system": {{
      "light_darkness": {{
        "light_represents": "What light symbolizes",
        "darkness_represents": "What darkness symbolizes",
        "transitions": "How light/dark shifts mark story beats"
      }},
      "color_palette": [
        {{
          "color": "Color name",
          "association": "What it represents",
          "character_link": "Which character if any",
          "usage_notes": "When and how to use"
        }}
      ],
      "spatial_metaphors": {{
        "height_depth": "What vertical space represents",
        "enclosure_openness": "What contained vs open spaces mean",
        "movement_patterns": "What directions of movement signify"
      }},
      "natural_imagery": [
        {{
          "element": "Weather/season/animal/plant",
          "meaning": "What it represents",
          "appearances": "When it appears"
        }}
      ],
      "object_symbols": [
        {{
          "object": "Door/mirror/water/etc",
          "meaning": "Symbolic significance",
          "key_moments": "Important appearances"
        }}
      ]
    }},
    "character_motifs": [
      {{
        "character": "Character name",
        "primary_motif": "Their signature symbol/image",
        "motif_meaning": "What it reveals about them",
        "arc_reflection": "How motif changes with character",
        "contrast_with": "Other character's motif it contrasts"
      }}
    ],
    "structural_motifs": {{
      "opening_image": {{
        "description": "The visual that opens the story",
        "establishes": "What it sets up",
        "echoed_in_closing": true
      }},
      "midpoint_mirror": {{
        "description": "Visual that marks the midpoint",
        "reversal_element": "What is inverted or transformed"
      }},
      "climax_convergence": {{
        "motifs_present": ["List of motifs that converge"],
        "synthesis": "How they combine for maximum impact"
      }},
      "closing_image": {{
        "description": "The final visual",
        "transformation": "How it differs from opening",
        "thematic_statement": "What it says about the theme"
      }}
    }}
  }},
  "scene_motif_targets": [
    {{
      "scene_number": 1,
      "scene_title": "Scene title",
      "primary_motif": "Main motif to feature",
      "secondary_motifs": ["Supporting motifs"],
      "visual_focus": "Key visual to emphasize",
      "color_emphasis": "Dominant color if any",
      "symbol_placement": "Where/how symbols appear",
      "subtext_layer": "What the motifs communicate beneath surface",
      "connection_to_theme": "How this advances thematic meaning"
    }}
  ],
  "motif_tracking": {{
    "setup_payoff_pairs": [
      {{
        "setup_scene": 2,
        "setup_description": "How motif is introduced",
        "payoff_scene": 8,
        "payoff_description": "How it pays off"
      }}
    ],
    "evolution_checkpoints": [
      {{
        "motif": "Symbol name",
        "checkpoint_scenes": [1, 5, 10],
        "evolution_notes": "How meaning shifts at each point"
      }}
    ]
  }},
  "integration_guidelines": {{
    "subtlety_level": "How overt vs subtle motifs should be",
    "density_recommendation": "How many motifs per scene",
    "reader_discovery": "What readers should consciously notice vs feel",
    "avoid_heavy_handedness": ["Specific warnings about overuse"]
  }}
}}
```

## Quality Standards

- Motifs should feel organic, not forced
- Symbols should have multiple layers of meaning
- Per-scene targets should be achievable without cluttering prose
- The system should enhance, not overshadow, the narrative
- Ensure motifs serve character and theme, not just decoration

Create a comprehensive motif bible that will guide the symbolic layer throughout the story.
"""
