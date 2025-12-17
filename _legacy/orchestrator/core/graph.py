"""
Graph-based Orchestration for MANOE

This module implements a Directed Cyclic Graph (DCG) for agent orchestration,
replacing the linear pipeline with a flexible graph structure that supports:
- Conditional transitions between nodes
- Cycles for self-correction (e.g., Critic -> Writer -> Critic)
- Parallel execution of independent nodes
- State-based routing decisions

Key concepts:
- Node: A unit of work (agent call, tool execution, etc.)
- Edge: A conditional transition between nodes
- GraphRunner: Executes the graph with state management
- NodeResult: Output from a node including next node selection
"""

import asyncio
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

from core.blackboard import RunContext


class NodeStatus(str, Enum):
    """Status of a node execution."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class NodeResult:
    """
    Result from executing a node.
    
    Contains:
    - output: The output data from the node
    - next_node: The next node to execute (or None for end)
    - state_updates: Updates to apply to the blackboard state
    - events: Events to emit for UI updates
    - metadata: Additional metadata for tracing
    """
    output: Any = None
    next_node: Optional[str] = None
    state_updates: Dict[str, Any] = field(default_factory=dict)
    events: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    status: NodeStatus = NodeStatus.COMPLETED
    error: Optional[str] = None


@dataclass
class Edge:
    """
    A conditional edge between nodes.
    
    Edges can have conditions that determine whether they should be taken.
    Multiple edges from a node are evaluated in order; first matching wins.
    """
    target: str  # Target node ID
    condition: Optional[Callable[[RunContext], bool]] = None  # Condition function
    priority: int = 0  # Higher priority edges are evaluated first
    label: str = ""  # Human-readable label for visualization
    
    def should_take(self, ctx: RunContext) -> bool:
        """Check if this edge should be taken."""
        if self.condition is None:
            return True
        return self.condition(ctx)


class Node(ABC):
    """
    Abstract base class for graph nodes.
    
    A node represents a unit of work in the orchestration graph.
    Nodes can be:
    - Agent nodes (call an LLM agent)
    - Tool nodes (execute a tool)
    - Decision nodes (route based on state)
    - Composite nodes (group of sub-nodes)
    """
    
    def __init__(
        self,
        node_id: str,
        name: str,
        description: str = "",
        max_retries: int = 3,
    ):
        self.node_id = node_id
        self.name = name
        self.description = description
        self.max_retries = max_retries
        self.edges: List[Edge] = []
        self.status = NodeStatus.PENDING
        self.execution_count = 0
        self.last_result: Optional[NodeResult] = None
    
    def add_edge(
        self,
        target: str,
        condition: Optional[Callable[[RunContext], bool]] = None,
        priority: int = 0,
        label: str = "",
    ) -> "Node":
        """Add an outgoing edge to another node."""
        self.edges.append(Edge(
            target=target,
            condition=condition,
            priority=priority,
            label=label,
        ))
        # Sort edges by priority (descending)
        self.edges.sort(key=lambda e: -e.priority)
        return self
    
    def get_next_node(self, ctx: RunContext) -> Optional[str]:
        """Determine the next node based on edges and conditions."""
        for edge in self.edges:
            if edge.should_take(ctx):
                return edge.target
        return None
    
    @abstractmethod
    async def execute(self, ctx: RunContext) -> NodeResult:
        """Execute the node and return the result."""
        pass
    
    def reset(self) -> None:
        """Reset node state for re-execution."""
        self.status = NodeStatus.PENDING
        self.execution_count = 0
        self.last_result = None


class AgentNode(Node):
    """
    A node that calls an LLM agent.
    
    This is the most common node type, representing a call to an AI agent
    like Writer, Critic, Architect, etc.
    """
    
    def __init__(
        self,
        node_id: str,
        name: str,
        agent_name: str,
        prompt_builder: Callable[[RunContext], str],
        output_parser: Optional[Callable[[str, RunContext], Any]] = None,
        description: str = "",
        max_retries: int = 3,
    ):
        super().__init__(node_id, name, description, max_retries)
        self.agent_name = agent_name
        self.prompt_builder = prompt_builder
        self.output_parser = output_parser
    
    async def execute(self, ctx: RunContext) -> NodeResult:
        """Execute the agent and return the result."""
        self.status = NodeStatus.RUNNING
        self.execution_count += 1
        
        start_time = time.time()
        
        try:
            # Build the prompt from context
            prompt = self.prompt_builder(ctx)
            
            # Emit start event
            ctx.emit_event("agent_node_start", {
                "node_id": self.node_id,
                "agent": self.agent_name,
                "execution_count": self.execution_count,
            })
            
            # Call the agent (this will be wired to the actual agent call)
            # For now, we store the prompt and expect the orchestrator to handle it
            result = NodeResult(
                output={"prompt": prompt, "agent": self.agent_name},
                metadata={
                    "node_id": self.node_id,
                    "agent": self.agent_name,
                    "execution_count": self.execution_count,
                    "latency_ms": (time.time() - start_time) * 1000,
                },
            )
            
            self.status = NodeStatus.COMPLETED
            self.last_result = result
            
            # Determine next node
            result.next_node = self.get_next_node(ctx)
            
            return result
            
        except Exception as e:
            self.status = NodeStatus.FAILED
            return NodeResult(
                status=NodeStatus.FAILED,
                error=str(e),
                metadata={"node_id": self.node_id, "agent": self.agent_name},
            )


class DecisionNode(Node):
    """
    A node that makes routing decisions based on state.
    
    Decision nodes don't perform work; they just evaluate conditions
    and route to the appropriate next node.
    """
    
    def __init__(
        self,
        node_id: str,
        name: str,
        description: str = "",
    ):
        super().__init__(node_id, name, description, max_retries=1)
    
    async def execute(self, ctx: RunContext) -> NodeResult:
        """Evaluate conditions and determine next node."""
        self.status = NodeStatus.COMPLETED
        self.execution_count += 1
        
        next_node = self.get_next_node(ctx)
        
        result = NodeResult(
            output={"decision": next_node},
            next_node=next_node,
            metadata={"node_id": self.node_id, "decision": next_node},
        )
        
        self.last_result = result
        return result


class QualityGateNode(Node):
    """
    A node that evaluates quality and decides whether to loop back.
    
    This is used for the Critic -> Writer cycle where:
    - If quality score < threshold, loop back to Writer
    - If quality score >= threshold, proceed to next phase
    """
    
    def __init__(
        self,
        node_id: str,
        name: str,
        threshold: float = 7.0,
        max_iterations: int = 3,
        score_field: str = "quality_scores",
        revision_target: str = "writer",
        success_target: str = "next_phase",
        description: str = "",
    ):
        super().__init__(node_id, name, description, max_retries=1)
        self.threshold = threshold
        self.max_iterations = max_iterations
        self.score_field = score_field
        self.revision_target = revision_target
        self.success_target = success_target
    
    async def execute(self, ctx: RunContext) -> NodeResult:
        """Evaluate quality and decide next step."""
        self.status = NodeStatus.COMPLETED
        self.execution_count += 1
        
        # Get current scene number from state
        current_scene = ctx.state.drafting.current_scene
        
        # Get quality score for current scene
        scores = ctx.state.quality_scores
        score = scores.get(current_scene, 0)
        
        # Get revision count
        revision_counts = ctx.state.drafting.revision_counts
        revisions = revision_counts.get(current_scene, 0)
        
        # Decide next step
        if score >= self.threshold:
            next_node = self.success_target
            decision = "pass"
        elif revisions >= self.max_iterations:
            next_node = self.success_target
            decision = "max_iterations_reached"
        else:
            next_node = self.revision_target
            decision = "needs_revision"
        
        result = NodeResult(
            output={
                "score": score,
                "threshold": self.threshold,
                "revisions": revisions,
                "max_iterations": self.max_iterations,
                "decision": decision,
            },
            next_node=next_node,
            metadata={
                "node_id": self.node_id,
                "scene": current_scene,
                "score": score,
                "decision": decision,
            },
        )
        
        # Emit quality gate event
        ctx.emit_event("quality_gate", {
            "scene": current_scene,
            "score": score,
            "threshold": self.threshold,
            "decision": decision,
            "revisions": revisions,
        })
        
        self.last_result = result
        return result


class Graph:
    """
    A directed graph of nodes for orchestration.
    
    The graph defines the structure of the generation pipeline,
    including all possible paths and cycles.
    """
    
    def __init__(self, name: str = "generation_graph"):
        self.name = name
        self.nodes: Dict[str, Node] = {}
        self.start_node: Optional[str] = None
        self.end_nodes: Set[str] = set()
    
    def add_node(self, node: Node) -> "Graph":
        """Add a node to the graph."""
        self.nodes[node.node_id] = node
        return self
    
    def set_start(self, node_id: str) -> "Graph":
        """Set the starting node."""
        if node_id not in self.nodes:
            raise ValueError(f"Node {node_id} not in graph")
        self.start_node = node_id
        return self
    
    def add_end(self, node_id: str) -> "Graph":
        """Add an end node."""
        if node_id not in self.nodes:
            raise ValueError(f"Node {node_id} not in graph")
        self.end_nodes.add(node_id)
        return self
    
    def connect(
        self,
        from_node: str,
        to_node: str,
        condition: Optional[Callable[[RunContext], bool]] = None,
        priority: int = 0,
        label: str = "",
    ) -> "Graph":
        """Connect two nodes with an edge."""
        if from_node not in self.nodes:
            raise ValueError(f"Node {from_node} not in graph")
        if to_node not in self.nodes:
            raise ValueError(f"Node {to_node} not in graph")
        
        self.nodes[from_node].add_edge(to_node, condition, priority, label)
        return self
    
    def get_node(self, node_id: str) -> Optional[Node]:
        """Get a node by ID."""
        return self.nodes.get(node_id)
    
    def reset(self) -> None:
        """Reset all nodes for re-execution."""
        for node in self.nodes.values():
            node.reset()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert graph to dictionary for visualization."""
        return {
            "name": self.name,
            "start_node": self.start_node,
            "end_nodes": list(self.end_nodes),
            "nodes": [
                {
                    "id": node.node_id,
                    "name": node.name,
                    "description": node.description,
                    "type": type(node).__name__,
                    "edges": [
                        {
                            "target": edge.target,
                            "label": edge.label,
                            "priority": edge.priority,
                        }
                        for edge in node.edges
                    ],
                }
                for node in self.nodes.values()
            ],
        }


class GraphRunner:
    """
    Executes a graph with state management and tracing.
    
    The runner:
    - Starts from the start node
    - Executes nodes in sequence based on edge conditions
    - Handles cycles (e.g., Critic -> Writer -> Critic)
    - Checkpoints state at configurable intervals
    - Supports pause/resume/cancel
    """
    
    def __init__(
        self,
        graph: Graph,
        checkpoint_interval: int = 1,  # Checkpoint every N nodes
        max_iterations: int = 100,  # Safety limit for cycles
    ):
        self.graph = graph
        self.checkpoint_interval = checkpoint_interval
        self.max_iterations = max_iterations
        self.execution_history: List[Dict[str, Any]] = []
        self.current_node: Optional[str] = None
        self.iteration_count = 0
    
    async def run(
        self,
        ctx: RunContext,
        start_from: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute the graph from start to end.
        
        Args:
            ctx: Execution context with state and services
            start_from: Optional node to start from (for resume)
            
        Returns:
            Final execution result
        """
        self.graph.reset()
        self.execution_history = []
        self.iteration_count = 0
        
        # Determine starting node
        self.current_node = start_from or self.graph.start_node
        if not self.current_node:
            raise ValueError("No start node defined")
        
        ctx.emit_event("graph_start", {
            "graph": self.graph.name,
            "start_node": self.current_node,
        })
        
        # Execute nodes until we reach an end node or max iterations
        while self.current_node and self.iteration_count < self.max_iterations:
            # Check for cancellation
            if ctx.check_cancelled():
                ctx.emit_event("graph_cancelled", {
                    "node": self.current_node,
                    "iteration": self.iteration_count,
                })
                return {
                    "status": "cancelled",
                    "last_node": self.current_node,
                    "iterations": self.iteration_count,
                }
            
            # Check for pause
            while ctx.check_pause():
                await asyncio.sleep(0.5)
            
            # Get current node
            node = self.graph.get_node(self.current_node)
            if not node:
                raise ValueError(f"Node {self.current_node} not found")
            
            # Execute the node
            self.iteration_count += 1
            start_time = time.time()
            
            ctx.emit_event("node_start", {
                "node_id": node.node_id,
                "name": node.name,
                "iteration": self.iteration_count,
            })
            
            try:
                result = await node.execute(ctx)
                
                # Record execution
                execution_record = {
                    "node_id": node.node_id,
                    "name": node.name,
                    "iteration": self.iteration_count,
                    "status": result.status.value,
                    "latency_ms": (time.time() - start_time) * 1000,
                    "next_node": result.next_node,
                }
                self.execution_history.append(execution_record)
                
                # Apply state updates
                for field_path, value in result.state_updates.items():
                    ctx.state.update(field_path, value, source=node.node_id)
                
                # Emit events
                for event in result.events:
                    ctx.emit_event(event.get("type", "node_event"), event.get("data", {}))
                
                ctx.emit_event("node_complete", {
                    "node_id": node.node_id,
                    "status": result.status.value,
                    "next_node": result.next_node,
                })
                
                # Checkpoint if needed
                if self.iteration_count % self.checkpoint_interval == 0:
                    await ctx.checkpoint()
                
                # Check if we've reached an end node
                if node.node_id in self.graph.end_nodes:
                    break
                
                # Move to next node
                self.current_node = result.next_node
                
            except Exception as e:
                ctx.emit_event("node_error", {
                    "node_id": node.node_id,
                    "error": str(e),
                })
                
                # Record failure
                self.execution_history.append({
                    "node_id": node.node_id,
                    "name": node.name,
                    "iteration": self.iteration_count,
                    "status": "failed",
                    "error": str(e),
                })
                
                return {
                    "status": "failed",
                    "error": str(e),
                    "last_node": self.current_node,
                    "iterations": self.iteration_count,
                }
        
        # Final checkpoint
        await ctx.checkpoint()
        
        ctx.emit_event("graph_complete", {
            "graph": self.graph.name,
            "iterations": self.iteration_count,
            "final_node": self.current_node,
        })
        
        return {
            "status": "completed",
            "iterations": self.iteration_count,
            "final_node": self.current_node,
            "history": self.execution_history,
        }
    
    def get_execution_summary(self) -> Dict[str, Any]:
        """Get a summary of the execution for debugging."""
        return {
            "graph": self.graph.name,
            "current_node": self.current_node,
            "iteration_count": self.iteration_count,
            "history_length": len(self.execution_history),
            "node_execution_counts": {
                node_id: sum(1 for h in self.execution_history if h["node_id"] == node_id)
                for node_id in self.graph.nodes.keys()
            },
        }


def build_generation_graph() -> Graph:
    """
    Build the default generation graph.
    
    This creates a graph that mirrors the current linear pipeline
    but with the flexibility to add cycles and conditional paths.
    
    Graph structure:
    genesis -> characters -> narrator_design -> worldbuilding -> outlining
    -> motif_layer -> advanced_planning -> drafting_loop -> polish -> end
    
    The drafting_loop contains:
    draft_scene -> critique -> quality_gate -> (revision or next_scene)
    """
    graph = Graph("manoe_generation")
    
    # Phase nodes (these will be connected to actual phase functions)
    graph.add_node(DecisionNode("genesis", "Genesis Phase", "Generate narrative possibility"))
    graph.add_node(DecisionNode("characters", "Characters Phase", "Create character profiles"))
    graph.add_node(DecisionNode("narrator_design", "Narrator Design", "Design narrator voice"))
    graph.add_node(DecisionNode("worldbuilding", "Worldbuilding Phase", "Build story world"))
    graph.add_node(DecisionNode("outlining", "Outlining Phase", "Create story outline"))
    graph.add_node(DecisionNode("motif_layer", "Motif Layer", "Plan symbolic elements"))
    graph.add_node(DecisionNode("advanced_planning", "Advanced Planning", "Detailed scene planning"))
    
    # Drafting loop nodes
    graph.add_node(DecisionNode("draft_scene", "Draft Scene", "Write scene draft"))
    graph.add_node(DecisionNode("critique_scene", "Critique Scene", "Evaluate scene quality"))
    graph.add_node(QualityGateNode(
        "quality_gate",
        "Quality Gate",
        threshold=7.0,
        max_iterations=3,
        revision_target="revise_scene",
        success_target="next_scene_check",
    ))
    graph.add_node(DecisionNode("revise_scene", "Revise Scene", "Revise based on critique"))
    graph.add_node(DecisionNode("next_scene_check", "Next Scene Check", "Check if more scenes"))
    
    # Polish phase
    graph.add_node(DecisionNode("polish", "Polish Phase", "Final polish of all scenes"))
    
    # End node
    graph.add_node(DecisionNode("end", "End", "Generation complete"))
    
    # Set start and end
    graph.set_start("genesis")
    graph.add_end("end")
    
    # Connect linear phases
    graph.connect("genesis", "characters")
    graph.connect("characters", "narrator_design")
    graph.connect("narrator_design", "worldbuilding")
    graph.connect("worldbuilding", "outlining")
    graph.connect("outlining", "motif_layer")
    graph.connect("motif_layer", "advanced_planning")
    graph.connect("advanced_planning", "draft_scene")
    
    # Drafting loop connections
    graph.connect("draft_scene", "critique_scene")
    graph.connect("critique_scene", "quality_gate")
    # Quality gate edges are handled internally by QualityGateNode
    graph.connect("revise_scene", "critique_scene")  # Loop back after revision
    
    # Next scene check - either draft next scene or go to polish
    graph.connect(
        "next_scene_check",
        "draft_scene",
        condition=lambda ctx: ctx.state.drafting.current_scene < ctx.state.drafting.total_scenes,
        priority=1,
        label="more_scenes",
    )
    graph.connect(
        "next_scene_check",
        "polish",
        condition=lambda ctx: ctx.state.drafting.current_scene >= ctx.state.drafting.total_scenes,
        priority=0,
        label="all_scenes_done",
    )
    
    # Polish to end
    graph.connect("polish", "end")
    
    return graph
