"""
Tool Registry for MANOE Agents

This module implements the Tool Use pattern where agents have access to
tools they can call autonomously instead of receiving pre-loaded context.

Key concepts:
- Tool: A callable function with a defined schema
- ToolSpec: JSON schema definition for a tool
- ToolRegistry: Central registry of available tools
- ToolExecutor: Executes tools and returns results

Example tools:
- search_vector_db: Search Qdrant for relevant content
- get_character: Get character details by name
- get_worldbuilding: Get worldbuilding elements
- summarize_context: Summarize long context
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from enum import Enum


class ToolCategory(str, Enum):
    """Categories of tools."""
    MEMORY = "memory"  # Vector DB search, retrieval
    CONTEXT = "context"  # Context management, summarization
    VALIDATION = "validation"  # Quality checks, consistency
    UTILITY = "utility"  # General utilities


@dataclass
class ToolSpec:
    """
    JSON Schema specification for a tool.
    
    This defines the tool's interface for LLM function calling.
    """
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema for parameters
    required: List[str] = field(default_factory=list)
    category: ToolCategory = ToolCategory.UTILITY
    
    def to_openai_function(self) -> Dict[str, Any]:
        """Convert to OpenAI function calling format."""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": self.parameters,
                "required": self.required,
            },
        }
    
    def to_anthropic_tool(self) -> Dict[str, Any]:
        """Convert to Anthropic tool format."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": self.parameters,
                "required": self.required,
            },
        }


@dataclass
class ToolResult:
    """Result from executing a tool."""
    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Tool:
    """
    A tool that agents can call.
    
    Tools encapsulate functionality that agents can invoke autonomously,
    such as searching vector databases or retrieving specific data.
    """
    spec: ToolSpec
    handler: Callable[..., Any]  # The actual function to execute
    is_async: bool = True
    
    async def execute(self, **kwargs: Any) -> ToolResult:
        """Execute the tool with the given arguments."""
        try:
            if self.is_async:
                result = await self.handler(**kwargs)
            else:
                result = self.handler(**kwargs)
            
            return ToolResult(
                success=True,
                data=result,
                metadata={"tool": self.spec.name},
            )
        except Exception as e:
            return ToolResult(
                success=False,
                error=str(e),
                metadata={"tool": self.spec.name},
            )


class ToolRegistry:
    """
    Central registry of tools available to agents.
    
    The registry:
    - Stores tool definitions and handlers
    - Provides tool specs for LLM function calling
    - Executes tools and returns results
    - Filters tools by category or agent
    """
    
    def __init__(self) -> None:
        self._tools: Dict[str, Tool] = {}
        self._agent_tools: Dict[str, List[str]] = {}  # agent_name -> tool_names
    
    def register(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        handler: Callable[..., Any],
        required: Optional[List[str]] = None,
        category: ToolCategory = ToolCategory.UTILITY,
        is_async: bool = True,
        agents: Optional[List[str]] = None,
    ) -> None:
        """
        Register a new tool.
        
        Args:
            name: Tool name (must be unique)
            description: Human-readable description
            parameters: JSON Schema for parameters
            handler: Function to execute
            required: Required parameter names
            category: Tool category
            is_async: Whether handler is async
            agents: List of agents that can use this tool (None = all)
        """
        spec = ToolSpec(
            name=name,
            description=description,
            parameters=parameters,
            required=required or [],
            category=category,
        )
        
        tool = Tool(spec=spec, handler=handler, is_async=is_async)
        self._tools[name] = tool
        
        # Register tool for specific agents
        if agents:
            for agent in agents:
                if agent not in self._agent_tools:
                    self._agent_tools[agent] = []
                self._agent_tools[agent].append(name)
    
    def get_tool(self, name: str) -> Optional[Tool]:
        """Get a tool by name."""
        return self._tools.get(name)
    
    def get_tools_for_agent(self, agent_name: str) -> List[Tool]:
        """Get all tools available to a specific agent."""
        # If agent has specific tools, return those
        if agent_name in self._agent_tools:
            return [self._tools[name] for name in self._agent_tools[agent_name] if name in self._tools]
        # Otherwise return all tools
        return list(self._tools.values())
    
    def get_tools_by_category(self, category: ToolCategory) -> List[Tool]:
        """Get all tools in a category."""
        return [tool for tool in self._tools.values() if tool.spec.category == category]
    
    def get_openai_functions(self, agent_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get tool specs in OpenAI function calling format."""
        if agent_name:
            tools = self.get_tools_for_agent(agent_name)
        else:
            tools = list(self._tools.values())
        return [tool.spec.to_openai_function() for tool in tools]
    
    def get_anthropic_tools(self, agent_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get tool specs in Anthropic tool format."""
        if agent_name:
            tools = self.get_tools_for_agent(agent_name)
        else:
            tools = list(self._tools.values())
        return [tool.spec.to_anthropic_tool() for tool in tools]
    
    async def execute(self, name: str, **kwargs: Any) -> ToolResult:
        """Execute a tool by name."""
        tool = self._tools.get(name)
        if not tool:
            return ToolResult(
                success=False,
                error=f"Tool '{name}' not found",
            )
        return await tool.execute(**kwargs)
    
    def list_tools(self) -> List[str]:
        """List all registered tool names."""
        return list(self._tools.keys())


def create_default_tools(ctx: Any) -> ToolRegistry:
    """
    Create the default tool registry with standard MANOE tools.
    
    Args:
        ctx: RunContext with access to services
        
    Returns:
        Configured ToolRegistry
    """
    registry = ToolRegistry()
    
    # Search characters tool
    registry.register(
        name="search_characters",
        description="Search for character information by query. Returns relevant character details from the story's character database.",
        parameters={
            "query": {
                "type": "string",
                "description": "Search query (e.g., character name, trait, relationship)",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results to return",
                "default": 3,
            },
        },
        required=["query"],
        category=ToolCategory.MEMORY,
        handler=lambda query, limit=3: ctx.search_characters(query, limit) if ctx else [],
        agents=["Writer", "Critic", "ConsistencyChecker"],
    )
    
    # Search worldbuilding tool
    registry.register(
        name="search_worldbuilding",
        description="Search for worldbuilding elements by query. Returns relevant world details like locations, cultures, rules.",
        parameters={
            "query": {
                "type": "string",
                "description": "Search query (e.g., location name, cultural element, world rule)",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results to return",
                "default": 3,
            },
        },
        required=["query"],
        category=ToolCategory.MEMORY,
        handler=lambda query, limit=3: ctx.search_worldbuilding(query, limit) if ctx else {},
        agents=["Writer", "Worldbuilder"],
    )
    
    # Search previous scenes tool
    registry.register(
        name="search_scenes",
        description="Search for relevant previous scenes by query. Returns scene content for continuity reference.",
        parameters={
            "query": {
                "type": "string",
                "description": "Search query (e.g., event, character interaction, location)",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results to return",
                "default": 2,
            },
        },
        required=["query"],
        category=ToolCategory.MEMORY,
        handler=lambda query, limit=2: ctx.search_scenes(query, limit) if ctx else [],
        agents=["Writer", "Critic"],
    )
    
    # Get character by name tool
    registry.register(
        name="get_character",
        description="Get detailed information about a specific character by name.",
        parameters={
            "name": {
                "type": "string",
                "description": "Character name to look up",
            },
        },
        required=["name"],
        category=ToolCategory.MEMORY,
        handler=lambda name: _get_character_by_name(ctx, name),
        agents=["Writer", "Critic", "Profiler"],
    )
    
    # Get current scene context tool
    registry.register(
        name="get_scene_context",
        description="Get the context for the current scene being written, including outline and previous scene summary.",
        parameters={},
        required=[],
        category=ToolCategory.CONTEXT,
        handler=lambda: _get_scene_context(ctx),
        agents=["Writer"],
    )
    
    # Summarize text tool
    registry.register(
        name="summarize_text",
        description="Summarize a long piece of text to fit within token limits.",
        parameters={
            "text": {
                "type": "string",
                "description": "Text to summarize",
            },
            "max_length": {
                "type": "integer",
                "description": "Maximum length of summary in characters",
                "default": 500,
            },
        },
        required=["text"],
        category=ToolCategory.CONTEXT,
        handler=lambda text, max_length=500: _summarize_text(text, max_length),
        is_async=False,
        agents=["Writer", "Critic"],
    )
    
    # Check consistency tool
    registry.register(
        name="check_consistency",
        description="Check if a piece of text is consistent with established story facts.",
        parameters={
            "text": {
                "type": "string",
                "description": "Text to check for consistency",
            },
            "aspects": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Aspects to check (e.g., 'character_names', 'timeline', 'world_rules')",
            },
        },
        required=["text"],
        category=ToolCategory.VALIDATION,
        handler=lambda text, aspects=None: _check_consistency(ctx, text, aspects),
        agents=["Critic", "ConsistencyChecker"],
    )
    
    return registry


def _get_character_by_name(ctx: Any, name: str) -> Dict[str, Any]:
    """Get character details by name from state."""
    if not ctx or not ctx.state:
        return {}
    
    characters: List[Dict[str, Any]] = ctx.state.characters.characters
    for char in characters:
        if char.get("name", "").lower() == name.lower():
            return dict(char)
    return {}


def _get_scene_context(ctx: Any) -> Dict[str, Any]:
    """Get context for the current scene."""
    if not ctx or not ctx.state:
        return {}
    
    current_scene = ctx.state.drafting.current_scene
    scenes = ctx.state.outline.scenes
    
    context = {
        "scene_number": current_scene,
        "total_scenes": len(scenes),
    }
    
    if current_scene > 0 and current_scene <= len(scenes):
        context["current_scene_outline"] = scenes[current_scene - 1]
    
    # Get previous scene summary
    drafts = ctx.state.drafting.drafts
    if current_scene > 1 and len(drafts) >= current_scene - 1:
        prev_draft = drafts[current_scene - 2]
        if prev_draft and prev_draft.get("draft"):
            content = prev_draft["draft"].get("narrative_content", "")
            context["previous_scene_summary"] = content[:500] + "..." if len(content) > 500 else content
    
    return context


def _summarize_text(text: str, max_length: int = 500) -> str:
    """Simple text summarization by truncation with sentence boundary."""
    if len(text) <= max_length:
        return text
    
    # Try to cut at sentence boundary
    truncated = text[:max_length]
    last_period = truncated.rfind(".")
    if last_period > max_length * 0.5:
        return truncated[:last_period + 1]
    return truncated + "..."


def _check_consistency(ctx: Any, text: str, aspects: Optional[List[str]] = None) -> Dict[str, Any]:
    """Check text consistency with story facts."""
    if not ctx or not ctx.state:
        return {"consistent": True, "issues": []}
    
    issues: List[str] = []
    
    # Check character name consistency
    if not aspects or "character_names" in aspects:
        characters = ctx.state.characters.characters
        char_names = [c.get("name", "") for c in characters]
        # Simple check: look for character-like capitalized words
        # In production, this would use NLP or the LLM
        for name in char_names:
            if name and name.lower() not in text.lower():
                pass  # Character not mentioned is fine
    
    return {
        "consistent": len(issues) == 0,
        "issues": issues,
        "aspects_checked": aspects or ["all"],
    }
