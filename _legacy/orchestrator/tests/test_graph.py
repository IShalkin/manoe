"""
Unit tests for the Graph-based Orchestration implementation.

Tests cover:
- QualityGateNode max_iterations safeguard (prevents infinite loops)
- Node execution and status tracking
- Graph construction and edge routing
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from core.graph import (
    Node,
    AgentNode,
    DecisionNode,
    QualityGateNode,
    Graph,
    Edge,
    NodeResult,
    NodeStatus,
)
from core.blackboard import BlackboardState, RunContext, DraftingData


class TestQualityGateNode:
    """Tests for QualityGateNode - critical for preventing infinite loops."""

    def test_default_max_iterations(self):
        """Test that QualityGateNode has max_iterations=3 by default."""
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
        )
        
        assert gate.max_iterations == 3

    def test_custom_max_iterations(self):
        """Test setting custom max_iterations."""
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
            max_iterations=5,
        )
        
        assert gate.max_iterations == 5

    def test_default_threshold(self):
        """Test that QualityGateNode has threshold=7.0 by default."""
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
        )
        
        assert gate.threshold == 7.0

    @pytest.mark.asyncio
    async def test_passes_when_score_above_threshold(self):
        """Test that gate passes when quality score >= threshold."""
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
            threshold=7.0,
            success_target="next_phase",
            revision_target="writer",
        )
        
        # Create mock context with high quality score
        state = BlackboardState()
        state.drafting.current_scene = 1
        state.quality_scores = {1: 8.5}  # Above threshold
        state.drafting.revision_counts = {1: 0}
        
        ctx = RunContext(state=state)
        
        result = await gate.execute(ctx)
        
        assert result.next_node == "next_phase"
        assert gate.status == NodeStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_requests_revision_when_score_below_threshold(self):
        """Test that gate requests revision when score < threshold."""
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
            threshold=7.0,
            success_target="next_phase",
            revision_target="writer",
        )
        
        # Create mock context with low quality score
        state = BlackboardState()
        state.drafting.current_scene = 1
        state.quality_scores = {1: 5.0}  # Below threshold
        state.drafting.revision_counts = {1: 0}  # First attempt
        
        ctx = RunContext(state=state)
        
        result = await gate.execute(ctx)
        
        assert result.next_node == "writer"

    @pytest.mark.asyncio
    async def test_stops_after_max_iterations(self):
        """
        CRITICAL TEST: Verify that gate stops after max_iterations.
        
        This prevents infinite loops where Writer and Critic keep
        cycling without improvement, burning API costs.
        """
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
            threshold=7.0,
            max_iterations=3,
            success_target="next_phase",
            revision_target="writer",
        )
        
        # Create mock context with low score but max revisions reached
        state = BlackboardState()
        state.drafting.current_scene = 1
        state.quality_scores = {1: 4.0}  # Still below threshold
        state.drafting.revision_counts = {1: 3}  # Max iterations reached
        
        ctx = RunContext(state=state)
        
        result = await gate.execute(ctx)
        
        # Should proceed to next phase despite low score
        assert result.next_node == "next_phase"

    @pytest.mark.asyncio
    async def test_revision_count_per_scene(self):
        """Test that revision counts are tracked per scene."""
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
            threshold=7.0,
            max_iterations=3,
        )
        
        state = BlackboardState()
        state.drafting.revision_counts = {
            1: 3,  # Scene 1: max iterations
            2: 1,  # Scene 2: still has attempts
        }
        
        # Scene 1 should pass (max iterations)
        state.drafting.current_scene = 1
        state.quality_scores = {1: 4.0}
        ctx = RunContext(state=state)
        result = await gate.execute(ctx)
        assert result.next_node == "next_phase"
        
        # Scene 2 should request revision (still has attempts)
        state.drafting.current_scene = 2
        state.quality_scores = {2: 4.0}
        result = await gate.execute(ctx)
        assert result.next_node == "writer"

    @pytest.mark.asyncio
    async def test_execution_count_increments(self):
        """Test that execution count increments on each call."""
        gate = QualityGateNode(
            node_id="quality_gate",
            name="Quality Gate",
        )
        
        state = BlackboardState()
        state.drafting.current_scene = 1
        state.quality_scores = {1: 8.0}
        state.drafting.revision_counts = {1: 0}
        ctx = RunContext(state=state)
        
        assert gate.execution_count == 0
        
        await gate.execute(ctx)
        assert gate.execution_count == 1
        
        await gate.execute(ctx)
        assert gate.execution_count == 2


class TestNodeStatus:
    """Tests for NodeStatus enum."""

    def test_status_values(self):
        """Test that all expected status values exist."""
        assert NodeStatus.PENDING.value == "pending"
        assert NodeStatus.RUNNING.value == "running"
        assert NodeStatus.COMPLETED.value == "completed"
        assert NodeStatus.FAILED.value == "failed"
        assert NodeStatus.SKIPPED.value == "skipped"


class TestEdge:
    """Tests for Edge class."""

    def test_create_unconditional_edge(self):
        """Test creating an unconditional edge."""
        edge = Edge(target="node_b")
        
        assert edge.target == "node_b"
        assert edge.condition is None

    def test_create_conditional_edge(self):
        """Test creating a conditional edge."""
        def condition(ctx):
            return ctx.state.quality_scores.get(1, 0) >= 7.0
        
        edge = Edge(
            target="next_phase",
            condition=condition,
        )
        
        assert edge.target == "next_phase"
        assert edge.condition is not None

    def test_edge_should_take_unconditional(self):
        """Test that unconditional edge always returns True."""
        edge = Edge(target="node_b")
        
        state = BlackboardState()
        ctx = RunContext(state=state)
        
        assert edge.should_take(ctx) is True

    def test_edge_should_take_conditional(self):
        """Test conditional edge evaluation."""
        def condition(ctx):
            return ctx.state.quality_scores.get(1, 0) >= 7.0
        
        edge = Edge(target="next_phase", condition=condition)
        
        # Below threshold
        state = BlackboardState()
        state.quality_scores = {1: 5.0}
        ctx = RunContext(state=state)
        assert edge.should_take(ctx) is False
        
        # Above threshold
        state.quality_scores = {1: 8.0}
        assert edge.should_take(ctx) is True


class TestGraph:
    """Tests for Graph class."""

    def test_create_empty_graph(self):
        """Test creating an empty graph."""
        graph = Graph(name="test_graph")
        
        assert graph.name == "test_graph"
        assert len(graph.nodes) == 0

    def test_add_node(self):
        """Test adding a node to the graph."""
        graph = Graph(name="test_graph")
        
        node = QualityGateNode(
            node_id="gate",
            name="Quality Gate",
        )
        
        graph.add_node(node)
        
        assert "gate" in graph.nodes
        assert graph.nodes["gate"] == node

    def test_connect_nodes(self):
        """Test connecting two nodes."""
        graph = Graph(name="test_graph")
        
        node_a = DecisionNode(
            node_id="node_a",
            name="Node A",
        )
        node_b = DecisionNode(
            node_id="node_b",
            name="Node B",
        )
        
        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.connect("node_a", "node_b")
        
        # Check that node_a has an edge to node_b
        assert len(node_a.edges) == 1
        assert node_a.edges[0].target == "node_b"

    def test_get_node(self):
        """Test getting a node by ID."""
        graph = Graph(name="test_graph")
        
        node = QualityGateNode(
            node_id="gate",
            name="Quality Gate",
        )
        graph.add_node(node)
        
        retrieved = graph.get_node("gate")
        
        assert retrieved == node

    def test_get_nonexistent_node(self):
        """Test getting a non-existent node returns None."""
        graph = Graph(name="test_graph")
        
        retrieved = graph.get_node("nonexistent")
        
        assert retrieved is None

    def test_set_start(self):
        """Test setting the start node of the graph."""
        graph = Graph(name="test_graph")
        
        node = QualityGateNode(
            node_id="start",
            name="Start",
        )
        graph.add_node(node)
        graph.set_start("start")
        
        assert graph.start_node == "start"

    def test_add_end(self):
        """Test adding an end node."""
        graph = Graph(name="test_graph")
        
        node = DecisionNode(
            node_id="end",
            name="End",
        )
        graph.add_node(node)
        graph.add_end("end")
        
        assert "end" in graph.end_nodes


class TestAgentNode:
    """Tests for AgentNode class."""

    def test_create_agent_node(self):
        """Test creating an agent node."""
        def prompt_builder(ctx):
            return "Write a scene"
        
        node = AgentNode(
            node_id="writer",
            name="Writer Agent",
            agent_name="writer",
            prompt_builder=prompt_builder,
            description="Writes scene drafts",
        )
        
        assert node.node_id == "writer"
        assert node.name == "Writer Agent"
        assert node.agent_name == "writer"
        assert node.description == "Writes scene drafts"
        assert node.status == NodeStatus.PENDING

    def test_agent_node_default_max_retries(self):
        """Test that agent nodes have default max_retries."""
        def prompt_builder(ctx):
            return "Write a scene"
        
        node = AgentNode(
            node_id="writer",
            name="Writer Agent",
            agent_name="writer",
            prompt_builder=prompt_builder,
        )
        
        assert node.max_retries == 3


class TestDecisionNode:
    """Tests for DecisionNode class."""

    def test_create_decision_node(self):
        """Test creating a decision node."""
        node = DecisionNode(
            node_id="scene_router",
            name="Scene Router",
            description="Routes to next scene or completion",
        )
        
        assert node.node_id == "scene_router"
        assert node.name == "Scene Router"
        assert node.description == "Routes to next scene or completion"

    @pytest.mark.asyncio
    async def test_decision_node_routing(self):
        """Test that decision node routes based on edges."""
        node = DecisionNode(
            node_id="scene_router",
            name="Scene Router",
        )
        
        # Add conditional edges
        node.add_edge(
            target="complete",
            condition=lambda ctx: ctx.state.drafting.current_scene >= ctx.state.drafting.total_scenes,
            priority=1,
        )
        node.add_edge(
            target="continue",
            condition=None,  # Default edge
            priority=0,
        )
        
        # Test continue path (scene 1 of 5)
        state = BlackboardState()
        state.drafting.current_scene = 1
        state.drafting.total_scenes = 5
        ctx = RunContext(state=state)
        
        result = await node.execute(ctx)
        assert result.next_node == "continue"
        
        # Test complete path (scene 5 of 5)
        state.drafting.current_scene = 5
        result = await node.execute(ctx)
        assert result.next_node == "complete"
