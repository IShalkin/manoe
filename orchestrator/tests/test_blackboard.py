"""
Unit tests for the Blackboard Pattern implementation.

Tests cover:
- BlackboardState creation and serialization
- KeyConstraints append-only semantics
- ConstraintFact creation and filtering
- State update tracking
"""

import pytest
from datetime import datetime
from core.blackboard import (
    BlackboardState,
    KeyConstraints,
    ConstraintFact,
    GenerationPhase,
    NarrativeData,
    CharacterData,
    DraftingData,
)


class TestConstraintFact:
    """Tests for ConstraintFact dataclass."""

    def test_create_constraint_fact(self):
        """Test creating a constraint fact with all fields."""
        fact = ConstraintFact(
            fact="Hero is wounded in left arm",
            category="character_state",
            source="writer_scene_3",
            scene_id=3,
            character_name="Hero",
        )
        
        assert fact.fact == "Hero is wounded in left arm"
        assert fact.category == "character_state"
        assert fact.source == "writer_scene_3"
        assert fact.scene_id == 3
        assert fact.character_name == "Hero"
        assert isinstance(fact.created_at, datetime)

    def test_constraint_fact_to_dict(self):
        """Test serialization of constraint fact."""
        fact = ConstraintFact(
            fact="Magic requires verbal incantation",
            category="world_rule",
            source="worldbuilding",
        )
        
        data = fact.to_dict()
        
        assert data["fact"] == "Magic requires verbal incantation"
        assert data["category"] == "world_rule"
        assert data["source"] == "worldbuilding"
        assert data["scene_id"] is None
        assert data["character_name"] is None
        assert "created_at" in data

    def test_constraint_fact_from_dict(self):
        """Test deserialization of constraint fact."""
        data = {
            "fact": "The letter was burned",
            "category": "plot_fact",
            "source": "writer_scene_5",
            "scene_id": 5,
            "character_name": None,
            "created_at": "2025-01-01T12:00:00",
        }
        
        fact = ConstraintFact.from_dict(data)
        
        assert fact.fact == "The letter was burned"
        assert fact.category == "plot_fact"
        assert fact.source == "writer_scene_5"
        assert fact.scene_id == 5


class TestKeyConstraints:
    """Tests for KeyConstraints class."""

    def test_create_empty_constraints(self):
        """Test creating empty key constraints."""
        constraints = KeyConstraints()
        
        assert len(constraints.facts) == 0

    def test_add_constraint_append_only(self):
        """Test that constraints can only be added (append-only)."""
        constraints = KeyConstraints()
        
        # Add first constraint
        fact1 = constraints.add_constraint(
            fact="Hero is wounded",
            category="character_state",
            source="writer",
        )
        
        assert len(constraints.facts) == 1
        assert constraints.facts[0] == fact1
        
        # Add second constraint
        fact2 = constraints.add_constraint(
            fact="It's raining",
            category="continuity",
            source="writer",
            scene_id=3,
        )
        
        assert len(constraints.facts) == 2
        assert constraints.facts[1] == fact2
        
        # Verify first constraint is still there (append-only)
        assert constraints.facts[0] == fact1

    def test_get_constraints_for_scene(self):
        """Test filtering constraints by scene."""
        constraints = KeyConstraints()
        
        # Add global constraint (no scene_id)
        constraints.add_constraint(
            fact="Magic exists",
            category="world_rule",
            source="worldbuilding",
        )
        
        # Add scene-specific constraints
        constraints.add_constraint(
            fact="Hero enters the castle",
            category="continuity",
            source="writer",
            scene_id=3,
        )
        constraints.add_constraint(
            fact="It's nighttime",
            category="continuity",
            source="writer",
            scene_id=5,
        )
        
        # Get constraints for scene 3
        scene_3_constraints = constraints.get_constraints_for_scene(3)
        
        # Should include global + scene 3 specific
        assert len(scene_3_constraints) == 2
        facts = [c.fact for c in scene_3_constraints]
        assert "Magic exists" in facts
        assert "Hero enters the castle" in facts
        assert "It's nighttime" not in facts

    def test_get_constraints_for_character(self):
        """Test filtering constraints by character."""
        constraints = KeyConstraints()
        
        # Add character-specific constraints
        constraints.add_constraint(
            fact="Hero is wounded",
            category="character_state",
            source="writer",
            character_name="Hero",
        )
        constraints.add_constraint(
            fact="Villain has the key",
            category="character_state",
            source="writer",
            character_name="Villain",
        )
        # Add global constraint
        constraints.add_constraint(
            fact="Magic exists",
            category="world_rule",
            source="worldbuilding",
        )
        
        # Get constraints for Hero
        hero_constraints = constraints.get_constraints_for_character("Hero")
        
        assert len(hero_constraints) == 2  # Hero-specific + global
        facts = [c.fact for c in hero_constraints]
        assert "Hero is wounded" in facts
        assert "Magic exists" in facts
        assert "Villain has the key" not in facts

    def test_get_constraints_by_category(self):
        """Test filtering constraints by category."""
        constraints = KeyConstraints()
        
        constraints.add_constraint(
            fact="Hero is wounded",
            category="character_state",
            source="writer",
        )
        constraints.add_constraint(
            fact="Magic exists",
            category="world_rule",
            source="worldbuilding",
        )
        constraints.add_constraint(
            fact="Villain is angry",
            category="character_state",
            source="writer",
        )
        
        character_states = constraints.get_constraints_by_category("character_state")
        
        assert len(character_states) == 2
        facts = [c.fact for c in character_states]
        assert "Hero is wounded" in facts
        assert "Villain is angry" in facts

    def test_to_context_string(self):
        """Test generating context string for prompts."""
        constraints = KeyConstraints()
        
        constraints.add_constraint(
            fact="Hero is wounded in left arm",
            category="character_state",
            source="writer",
        )
        constraints.add_constraint(
            fact="Magic requires verbal incantation",
            category="world_rule",
            source="worldbuilding",
        )
        
        context_str = constraints.to_context_string()
        
        assert "KEY CONSTRAINTS (DO NOT VIOLATE)" in context_str
        assert "CHARACTER STATES" in context_str
        assert "Hero is wounded in left arm" in context_str
        assert "WORLD RULES" in context_str
        assert "Magic requires verbal incantation" in context_str

    def test_to_context_string_empty(self):
        """Test context string for empty constraints."""
        constraints = KeyConstraints()
        
        context_str = constraints.to_context_string()
        
        assert context_str == ""

    def test_serialization_roundtrip(self):
        """Test that constraints survive serialization/deserialization."""
        constraints = KeyConstraints()
        
        constraints.add_constraint(
            fact="Hero is wounded",
            category="character_state",
            source="writer",
            scene_id=3,
            character_name="Hero",
        )
        constraints.add_constraint(
            fact="Magic exists",
            category="world_rule",
            source="worldbuilding",
        )
        
        # Serialize
        data = constraints.to_dict()
        
        # Deserialize
        restored = KeyConstraints.from_dict(data)
        
        assert len(restored.facts) == 2
        assert restored.facts[0].fact == "Hero is wounded"
        assert restored.facts[0].scene_id == 3
        assert restored.facts[1].fact == "Magic exists"


class TestBlackboardState:
    """Tests for BlackboardState class."""

    def test_create_default_state(self):
        """Test creating a default blackboard state."""
        state = BlackboardState()
        
        assert state.run_id == ""
        assert state.phase == GenerationPhase.GENESIS
        assert isinstance(state.key_constraints, KeyConstraints)
        assert len(state.key_constraints.facts) == 0

    def test_state_with_identifiers(self):
        """Test creating state with identifiers."""
        state = BlackboardState(
            run_id="run-123",
            project_id="proj-456",
            user_id="user-789",
        )
        
        assert state.run_id == "run-123"
        assert state.project_id == "proj-456"
        assert state.user_id == "user-789"

    def test_update_field(self):
        """Test updating a field with change tracking."""
        state = BlackboardState()
        
        state.update("narrative.seed_idea", "A hero's journey", source="genesis")
        
        assert state.narrative.seed_idea == "A hero's journey"
        assert len(state._change_log) == 1
        assert state._change_log[0]["field"] == "narrative.seed_idea"
        assert state._change_log[0]["source"] == "genesis"

    def test_update_nested_field(self):
        """Test updating a nested field."""
        state = BlackboardState()
        
        state.update("drafting.current_scene", 5, source="orchestrator")
        
        assert state.drafting.current_scene == 5

    def test_get_field(self):
        """Test getting a field value."""
        state = BlackboardState()
        state.narrative.seed_idea = "Test idea"
        
        value = state.get("narrative.seed_idea")
        
        assert value == "Test idea"

    def test_get_field_with_default(self):
        """Test getting a non-existent field with default."""
        state = BlackboardState()
        
        value = state.get("nonexistent.field", default="default_value")
        
        assert value == "default_value"

    def test_to_dict_includes_key_constraints(self):
        """Test that serialization includes key constraints."""
        state = BlackboardState(run_id="test-run")
        state.key_constraints.add_constraint(
            fact="Hero is wounded",
            category="character_state",
            source="writer",
        )
        
        data = state.to_dict()
        
        assert "key_constraints" in data
        assert len(data["key_constraints"]["facts"]) == 1
        assert data["key_constraints"]["facts"][0]["fact"] == "Hero is wounded"

    def test_from_dict_restores_key_constraints(self):
        """Test that deserialization restores key constraints."""
        data = {
            "run_id": "test-run",
            "project_id": "",
            "user_id": "",
            "phase": "genesis",
            "narrative": {"seed_idea": "", "narrative_possibility": {}, "themes": [], "tone": "", "genre": "", "target_audience": "", "moral_compass": "ambiguous"},
            "characters": {"characters": [], "protagonist": None, "antagonist": None, "supporting_cast": []},
            "worldbuilding": {"worldbuilding": {}, "geography": [], "cultures": [], "rules": [], "history": []},
            "outline": {"outline": {}, "scenes": [], "structure": "", "estimated_word_count": 0},
            "advanced_planning": {"motif_bible": {}, "contradiction_maps": {}, "emotional_beat_sheet": {}, "complexity_checklist": {}},
            "drafting": {"drafts": [], "current_scene": 0, "total_scenes": 0, "critiques": {}, "revision_counts": {}},
            "narrator": {"voice": "", "perspective": "", "style": "", "design": {}},
            "key_constraints": {
                "facts": [
                    {
                        "fact": "Hero is wounded",
                        "category": "character_state",
                        "source": "writer",
                        "scene_id": None,
                        "character_name": "Hero",
                        "created_at": "2025-01-01T12:00:00",
                    }
                ]
            },
            "polished_scenes": [],
            "quality_scores": {},
            "quality_feedback": {},
            "started_at": None,
            "completed_at": None,
            "last_checkpoint": None,
            "error": None,
        }
        
        state = BlackboardState.from_dict(data)
        
        assert len(state.key_constraints.facts) == 1
        assert state.key_constraints.facts[0].fact == "Hero is wounded"
        assert state.key_constraints.facts[0].character_name == "Hero"

    def test_dirty_fields_tracking(self):
        """Test dirty field tracking for checkpoints."""
        state = BlackboardState()
        
        state.update("narrative.seed_idea", "Test", source="test")
        
        dirty = state.get_dirty_fields()
        assert "narrative.seed_idea" in dirty
        
        state.clear_dirty_fields()
        
        dirty = state.get_dirty_fields()
        assert len(dirty) == 0

    def test_revision_counts_tracking(self):
        """Test that revision counts are tracked per scene."""
        state = BlackboardState()
        
        # Simulate revision tracking
        state.drafting.revision_counts = {1: 0, 2: 1, 3: 2}
        
        assert state.drafting.revision_counts[1] == 0
        assert state.drafting.revision_counts[2] == 1
        assert state.drafting.revision_counts[3] == 2
