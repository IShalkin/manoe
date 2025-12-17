"""
Unit tests for the Context Management implementation.

Tests cover:
- ContextBuilder key constraints injection
- ContextManager token tracking
- Summary creation and retrieval
"""

import pytest
from unittest.mock import MagicMock, AsyncMock
from core.summarization import (
    ContextBuilder,
    ContextManager,
    SummarizationChain,
    ContextBudget,
    Summary,
)
from core.blackboard import KeyConstraints


class TestContextBudget:
    """Tests for ContextBudget dataclass."""

    def test_available_for_context(self):
        """Test calculating available tokens for context."""
        budget = ContextBudget(
            total_tokens=128000,
            system_prompt_tokens=2000,
            output_tokens=4000,
            summary_tokens=2000,
            current_scene_tokens=4000,
        )
        
        available = budget.available_for_context
        
        # 128000 - 2000 - 4000 - 2000 - 4000 = 116000
        assert available == 116000

    def test_available_for_context_with_defaults(self):
        """Test available tokens with default values."""
        budget = ContextBudget()
        
        # Default values from implementation
        assert budget.total_tokens == 128000
        assert budget.system_prompt_tokens == 2000
        assert budget.output_tokens == 4000
        assert budget.summary_tokens == 2000
        assert budget.current_scene_tokens == 4000
        # 128000 - 2000 - 4000 - 2000 - 4000 = 116000
        assert budget.available_for_context == 116000


class TestSummary:
    """Tests for Summary dataclass."""

    def test_create_summary(self):
        """Test creating a summary."""
        summary = Summary(
            content="Hero enters the castle and meets the wizard.",
            source_type="scene",
            source_ids=["scene_1"],
            token_count=15,
        )
        
        assert summary.content == "Hero enters the castle and meets the wizard."
        assert summary.source_type == "scene"
        assert summary.source_ids == ["scene_1"]
        assert summary.token_count == 15


class TestContextBuilder:
    """Tests for ContextBuilder class."""

    def setup_method(self):
        """Set up test fixtures."""
        # Create a mock ContextManager
        self.mock_context_manager = MagicMock(spec=ContextManager)
        self.mock_context_manager.build_context.return_value = {
            "story_summary": "The hero began their journey.",
            "recent_scenes": [
                {"scene_number": 1, "summary": "Hero leaves home."},
                {"scene_number": 2, "summary": "Hero meets mentor."},
            ],
        }
        
        self.builder = ContextBuilder(self.mock_context_manager)

    def test_build_writer_context_basic(self):
        """Test building basic writer context."""
        context = self.builder.build_writer_context(
            current_scene=3,
            scene_outline={"title": "The Challenge"},
            characters=[{"name": "Hero", "description": "A brave warrior"}],
            worldbuilding={"setting": "Medieval fantasy"},
            narrator_config={"voice": "Third person", "perspective": "Limited"},
        )
        
        assert "STORY SO FAR" in context
        assert "RECENT SCENES" in context
        assert "CURRENT SCENE OUTLINE" in context
        assert "KEY CHARACTERS" in context
        assert "WORLD CONTEXT" in context
        assert "NARRATOR" in context

    def test_build_writer_context_with_key_constraints(self):
        """Test that key constraints are injected into writer context."""
        constraints = KeyConstraints()
        constraints.add_constraint(
            fact="Hero is wounded in left arm",
            category="character_state",
            source="writer_scene_2",
        )
        constraints.add_constraint(
            fact="It's raining outside",
            category="continuity",
            source="writer_scene_2",
        )
        
        constraints_text = constraints.to_context_string()
        
        context = self.builder.build_writer_context(
            current_scene=3,
            scene_outline={"title": "The Challenge"},
            characters=[],
            worldbuilding={},
            narrator_config={},
            key_constraints_text=constraints_text,
            is_revision=True,
        )
        
        assert "KEY CONSTRAINTS (DO NOT VIOLATE)" in context
        assert "Hero is wounded in left arm" in context
        assert "It's raining outside" in context

    def test_build_writer_context_constraints_at_top(self):
        """Test that key constraints appear at the top of context."""
        constraints = KeyConstraints()
        constraints.add_constraint(
            fact="Hero is wounded",
            category="character_state",
            source="writer",
        )
        
        constraints_text = constraints.to_context_string()
        
        context = self.builder.build_writer_context(
            current_scene=3,
            scene_outline={"title": "Test"},
            characters=[],
            worldbuilding={},
            narrator_config={},
            key_constraints_text=constraints_text,
            is_revision=True,
        )
        
        # Key constraints should appear before story summary
        constraints_pos = context.find("KEY CONSTRAINTS")
        story_pos = context.find("STORY SO FAR")
        
        assert constraints_pos < story_pos

    def test_build_writer_context_no_constraints_on_first_draft(self):
        """Test that empty constraints don't add section."""
        context = self.builder.build_writer_context(
            current_scene=1,
            scene_outline={"title": "Opening"},
            characters=[],
            worldbuilding={},
            narrator_config={},
            key_constraints_text="",  # Empty constraints
            is_revision=False,
        )
        
        assert "KEY CONSTRAINTS" not in context

    def test_build_critic_context_basic(self):
        """Test building basic critic context."""
        context = self.builder.build_critic_context(
            scene_draft="The hero walked into the castle...",
            scene_outline={"title": "The Challenge"},
            characters=[{"name": "Hero", "traits": ["brave", "kind"]}],
        )
        
        assert "SCENE DRAFT" in context
        assert "The hero walked into the castle" in context
        assert "SCENE OUTLINE" in context
        assert "CHARACTERS" in context

    def test_build_critic_context_with_key_constraints(self):
        """Test that key constraints are injected into critic context."""
        constraints = KeyConstraints()
        constraints.add_constraint(
            fact="Hero is wounded in left arm",
            category="character_state",
            source="writer",
        )
        
        constraints_text = constraints.to_context_string()
        
        context = self.builder.build_critic_context(
            scene_draft="The hero raised both arms in victory...",
            scene_outline={"title": "Victory"},
            characters=[],
            key_constraints_text=constraints_text,
        )
        
        assert "KEY CONSTRAINTS (DO NOT VIOLATE)" in context
        assert "Hero is wounded in left arm" in context
        assert "Verify the draft does NOT violate" in context

    def test_build_critic_context_with_previous_critiques(self):
        """Test critic context includes previous critiques."""
        context = self.builder.build_critic_context(
            scene_draft="The hero walked...",
            scene_outline={},
            characters=[],
            previous_critiques=[
                {"feedback": "Add more description of the setting."},
                {"feedback": "The dialogue feels stilted."},
            ],
        )
        
        assert "PREVIOUS FEEDBACK" in context
        assert "Add more description" in context
        assert "dialogue feels stilted" in context


class TestContextManager:
    """Tests for ContextManager class."""

    def test_estimate_tokens(self):
        """Test token estimation."""
        manager = ContextManager()
        
        text = "Hello world, this is a test."
        tokens = manager.estimate_tokens(text)
        
        # Rough estimate: ~1.3 tokens per word
        assert tokens > 0
        # 7 words * 1.3 = ~9 tokens
        assert tokens == int(len(text.split()) * 1.3)

    def test_should_summarize(self):
        """Test summarization threshold check."""
        manager = ContextManager(summarize_after_scenes=5)
        
        # Add some scene summaries to the chain
        manager.summarization_chain.summaries["scene_1"] = Summary(
            content="Scene 1 summary",
            source_type="scene",
            source_ids=["scene_1"],
            token_count=10,
        )
        manager.summarization_chain.summaries["scene_2"] = Summary(
            content="Scene 2 summary",
            source_type="scene",
            source_ids=["scene_2"],
            token_count=10,
        )
        
        # Below threshold (2 scenes, need 5)
        assert not manager.should_summarize(current_scene=2)
        
        # Add more scenes to reach threshold
        for i in range(3, 6):
            manager.summarization_chain.summaries[f"scene_{i}"] = Summary(
                content=f"Scene {i} summary",
                source_type="scene",
                source_ids=[f"scene_{i}"],
                token_count=10,
            )
        
        # At threshold (5 scenes)
        assert manager.should_summarize(current_scene=5)

    def test_get_token_usage(self):
        """Test getting token usage statistics."""
        manager = ContextManager()
        
        # Add some summaries
        manager.summarization_chain.summaries["scene_1"] = Summary(
            content="Scene 1 summary",
            source_type="scene",
            source_ids=["scene_1"],
            token_count=10,
        )
        
        usage = manager.get_token_usage()
        
        assert "story_summary" in usage
        assert "archived_scenes" in usage
        assert "active_scene_summaries" in usage


class TestSummarizationChain:
    """Tests for SummarizationChain class."""

    def test_get_summary_not_found(self):
        """Test getting a non-existent summary."""
        chain = SummarizationChain(model_client=None)
        
        summary = chain.get_summary("nonexistent_key")
        
        assert summary is None

    def test_get_all_summaries_empty(self):
        """Test getting all summaries when empty."""
        chain = SummarizationChain(model_client=None)
        
        summaries = chain.get_all_summaries()
        
        assert len(summaries) == 0

    def test_get_all_summaries_by_type(self):
        """Test filtering summaries by source type."""
        chain = SummarizationChain(model_client=None)
        
        # Add scene summaries
        chain.summaries["scene_1"] = Summary(
            content="Scene 1",
            source_type="scene",
            source_ids=["scene_1"],
            token_count=10,
        )
        chain.summaries["scene_2"] = Summary(
            content="Scene 2",
            source_type="scene",
            source_ids=["scene_2"],
            token_count=10,
        )
        
        # Add batch summary
        chain.summaries["batch_1"] = Summary(
            content="Batch 1",
            source_type="scenes_batch",
            source_ids=["scene_1", "scene_2"],
            token_count=20,
        )
        
        # Get only scene summaries
        scene_summaries = chain.get_all_summaries(source_type="scene")
        assert len(scene_summaries) == 2
        
        # Get only batch summaries
        batch_summaries = chain.get_all_summaries(source_type="scenes_batch")
        assert len(batch_summaries) == 1


class TestKeyConstraintsIntegration:
    """Integration tests for key constraints with context building."""

    def test_constraints_survive_multiple_revisions(self):
        """Test that constraints persist across revision cycles."""
        constraints = KeyConstraints()
        
        # Add constraint in first revision
        constraints.add_constraint(
            fact="Hero is wounded",
            category="character_state",
            source="writer_v1",
        )
        
        # Simulate second revision - add more constraints
        constraints.add_constraint(
            fact="Villain escaped",
            category="plot_fact",
            source="writer_v2",
        )
        
        # All constraints should still be present
        assert len(constraints.facts) == 2
        
        context_str = constraints.to_context_string()
        assert "Hero is wounded" in context_str
        assert "Villain escaped" in context_str

    def test_constraints_filter_by_scene_for_context(self):
        """Test filtering constraints by scene for context injection."""
        constraints = KeyConstraints()
        
        # Global constraint
        constraints.add_constraint(
            fact="Magic exists in this world",
            category="world_rule",
            source="worldbuilding",
        )
        
        # Scene-specific constraints
        constraints.add_constraint(
            fact="Hero is in the forest",
            category="continuity",
            source="writer",
            scene_id=3,
        )
        constraints.add_constraint(
            fact="Hero is in the castle",
            category="continuity",
            source="writer",
            scene_id=5,
        )
        
        # Get context for scene 3
        context_str = constraints.to_context_string(scene_id=3)
        
        assert "Magic exists" in context_str  # Global
        assert "Hero is in the forest" in context_str  # Scene 3
        assert "Hero is in the castle" not in context_str  # Scene 5 only

    def test_constraints_prevent_context_drift_scenario(self):
        """
        Test the Context Drift prevention scenario.
        
        Scenario:
        1. Writer writes scene where hero is wounded
        2. Critic asks for more drama
        3. Writer adds drama but might forget the wound
        4. Key constraints ensure wound is always in context
        """
        constraints = KeyConstraints()
        
        # After scene 1: Hero gets wounded
        constraints.add_constraint(
            fact="Hero was stabbed in the left shoulder during the fight",
            category="character_state",
            source="writer_scene_1",
            character_name="Hero",
        )
        
        # After scene 2: Weather established
        constraints.add_constraint(
            fact="Heavy rain has been falling since morning",
            category="continuity",
            source="writer_scene_2",
        )
        
        # Now in scene 3 revision cycle:
        # The context string should include both constraints
        context_str = constraints.to_context_string(scene_id=3)
        
        # Both constraints should be present to prevent drift
        assert "stabbed in the left shoulder" in context_str
        assert "Heavy rain" in context_str
        
        # The format should make it clear these are constraints
        assert "DO NOT VIOLATE" in context_str
