"""
MANOE Core Architecture - Senior+ Level Components

This module contains the core architectural components for the MANOE orchestrator:
- Blackboard Pattern (Shared State)
- Graph-based Orchestration
- Tool Registry
- Evals Framework (LLM-as-Judge)
- Context Management (Summarization Chains)
"""

from core.blackboard import (
    BlackboardState,
    RunContext,
    GenerationPhase,
    NarrativeData,
    CharacterData,
    WorldbuildingData,
    OutlineData,
    AdvancedPlanningData,
    DraftingData,
    NarratorConfig,
    KeyConstraints,
    ConstraintFact,
)
from core.graph import (
    GraphRunner,
    Graph,
    Node,
    AgentNode,
    DecisionNode,
    QualityGateNode,
    Edge,
    NodeResult,
    NodeStatus,
    build_generation_graph,
)
from core.tools import (
    ToolRegistry,
    Tool,
    ToolSpec,
    ToolResult,
    ToolCategory,
    create_default_tools,
)
from core.evals import (
    LLMJudge,
    EvalRunner,
    EvalDataset,
    EvalReport,
    EvalResult,
    EvalCriteria,
    EvalCriterion,
    TestCase,
    create_default_dataset,
)
from core.summarization import (
    SummarizationChain,
    ContextManager,
    ContextBuilder,
    ContextBudget,
    Summary,
)

__all__ = [
    # Blackboard Pattern
    "BlackboardState",
    "RunContext",
    "GenerationPhase",
    "NarrativeData",
    "CharacterData",
    "WorldbuildingData",
    "OutlineData",
    "AdvancedPlanningData",
    "DraftingData",
    "NarratorConfig",
    "KeyConstraints",
    "ConstraintFact",
    # Graph-based Orchestration
    "GraphRunner",
    "Graph",
    "Node",
    "AgentNode",
    "DecisionNode",
    "QualityGateNode",
    "Edge",
    "NodeResult",
    "NodeStatus",
    "build_generation_graph",
    # Tool Registry
    "ToolRegistry",
    "Tool",
    "ToolSpec",
    "ToolResult",
    "ToolCategory",
    "create_default_tools",
    # Evals Framework
    "LLMJudge",
    "EvalRunner",
    "EvalDataset",
    "EvalReport",
    "EvalResult",
    "EvalCriteria",
    "EvalCriterion",
    "TestCase",
    "create_default_dataset",
    # Context Management
    "SummarizationChain",
    "ContextManager",
    "ContextBuilder",
    "ContextBudget",
    "Summary",
]
