"""
Unit tests for the Tool Registry implementation.

Tests cover:
- ToolSpec creation and conversion to OpenAI/Anthropic formats
- ToolResult creation
- Tool execution
- ToolRegistry registration and retrieval
- Default tools creation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from core.tools import (
    ToolCategory,
    ToolSpec,
    ToolResult,
    Tool,
    ToolRegistry,
    create_default_tools,
    _get_character_by_name,
    _get_scene_context,
    _summarize_text,
    _check_consistency,
)
from core.blackboard import BlackboardState, RunContext, CharacterData, DraftingData, OutlineData


class TestToolCategory:
    """Tests for ToolCategory enum."""

    def test_category_values(self):
        """Test that all expected category values exist."""
        assert ToolCategory.MEMORY.value == "memory"
        assert ToolCategory.CONTEXT.value == "context"
        assert ToolCategory.VALIDATION.value == "validation"
        assert ToolCategory.UTILITY.value == "utility"


class TestToolSpec:
    """Tests for ToolSpec class."""

    def test_create_tool_spec(self):
        """Test creating a tool spec."""
        spec = ToolSpec(
            name="search_characters",
            description="Search for characters",
            parameters={
                "query": {"type": "string", "description": "Search query"},
            },
            required=["query"],
            category=ToolCategory.MEMORY,
        )
        
        assert spec.name == "search_characters"
        assert spec.description == "Search for characters"
        assert "query" in spec.parameters
        assert spec.required == ["query"]
        assert spec.category == ToolCategory.MEMORY

    def test_to_openai_function(self):
        """Test converting to OpenAI function format."""
        spec = ToolSpec(
            name="search_characters",
            description="Search for characters",
            parameters={
                "query": {"type": "string", "description": "Search query"},
            },
            required=["query"],
        )
        
        openai_func = spec.to_openai_function()
        
        assert openai_func["name"] == "search_characters"
        assert openai_func["description"] == "Search for characters"
        assert openai_func["parameters"]["type"] == "object"
        assert "query" in openai_func["parameters"]["properties"]
        assert openai_func["parameters"]["required"] == ["query"]

    def test_to_anthropic_tool(self):
        """Test converting to Anthropic tool format."""
        spec = ToolSpec(
            name="search_characters",
            description="Search for characters",
            parameters={
                "query": {"type": "string", "description": "Search query"},
            },
            required=["query"],
        )
        
        anthropic_tool = spec.to_anthropic_tool()
        
        assert anthropic_tool["name"] == "search_characters"
        assert anthropic_tool["description"] == "Search for characters"
        assert anthropic_tool["input_schema"]["type"] == "object"
        assert "query" in anthropic_tool["input_schema"]["properties"]
        assert anthropic_tool["input_schema"]["required"] == ["query"]


class TestToolResult:
    """Tests for ToolResult class."""

    def test_create_success_result(self):
        """Test creating a successful result."""
        result = ToolResult(
            success=True,
            data={"characters": ["Alice", "Bob"]},
            metadata={"tool": "search_characters"},
        )
        
        assert result.success is True
        assert result.data == {"characters": ["Alice", "Bob"]}
        assert result.error is None
        assert result.metadata["tool"] == "search_characters"

    def test_create_error_result(self):
        """Test creating an error result."""
        result = ToolResult(
            success=False,
            error="Tool not found",
            metadata={"tool": "unknown"},
        )
        
        assert result.success is False
        assert result.data is None
        assert result.error == "Tool not found"


class TestTool:
    """Tests for Tool class."""

    @pytest.mark.asyncio
    async def test_execute_async_handler(self):
        """Test executing an async handler."""
        async def async_handler(query: str) -> list:
            return [{"name": query}]
        
        spec = ToolSpec(
            name="test_tool",
            description="Test tool",
            parameters={"query": {"type": "string"}},
        )
        
        tool = Tool(spec=spec, handler=async_handler, is_async=True)
        result = await tool.execute(query="Alice")
        
        assert result.success is True
        assert result.data == [{"name": "Alice"}]
        assert result.metadata["tool"] == "test_tool"

    @pytest.mark.asyncio
    async def test_execute_sync_handler(self):
        """Test executing a sync handler."""
        def sync_handler(query: str) -> list:
            return [{"name": query}]
        
        spec = ToolSpec(
            name="test_tool",
            description="Test tool",
            parameters={"query": {"type": "string"}},
        )
        
        tool = Tool(spec=spec, handler=sync_handler, is_async=False)
        result = await tool.execute(query="Bob")
        
        assert result.success is True
        assert result.data == [{"name": "Bob"}]

    @pytest.mark.asyncio
    async def test_execute_handler_error(self):
        """Test handling errors in handler execution."""
        async def failing_handler(query: str) -> list:
            raise ValueError("Test error")
        
        spec = ToolSpec(
            name="test_tool",
            description="Test tool",
            parameters={"query": {"type": "string"}},
        )
        
        tool = Tool(spec=spec, handler=failing_handler, is_async=True)
        result = await tool.execute(query="test")
        
        assert result.success is False
        assert "Test error" in result.error


class TestToolRegistry:
    """Tests for ToolRegistry class."""

    def test_create_empty_registry(self):
        """Test creating an empty registry."""
        registry = ToolRegistry()
        
        assert len(registry.list_tools()) == 0

    def test_register_tool(self):
        """Test registering a tool."""
        registry = ToolRegistry()
        
        async def handler(query: str) -> list:
            return []
        
        registry.register(
            name="search_test",
            description="Test search",
            parameters={"query": {"type": "string"}},
            handler=handler,
            required=["query"],
            category=ToolCategory.MEMORY,
        )
        
        assert "search_test" in registry.list_tools()

    def test_get_tool(self):
        """Test getting a tool by name."""
        registry = ToolRegistry()
        
        async def handler(query: str) -> list:
            return []
        
        registry.register(
            name="search_test",
            description="Test search",
            parameters={"query": {"type": "string"}},
            handler=handler,
        )
        
        tool = registry.get_tool("search_test")
        
        assert tool is not None
        assert tool.spec.name == "search_test"

    def test_get_nonexistent_tool(self):
        """Test getting a non-existent tool returns None."""
        registry = ToolRegistry()
        
        tool = registry.get_tool("nonexistent")
        
        assert tool is None

    def test_register_tool_for_specific_agents(self):
        """Test registering a tool for specific agents."""
        registry = ToolRegistry()
        
        async def handler(query: str) -> list:
            return []
        
        registry.register(
            name="writer_tool",
            description="Writer only tool",
            parameters={"query": {"type": "string"}},
            handler=handler,
            agents=["Writer", "Critic"],
        )
        
        # Writer should have access
        writer_tools = registry.get_tools_for_agent("Writer")
        assert len(writer_tools) == 1
        assert writer_tools[0].spec.name == "writer_tool"
        
        # Critic should have access
        critic_tools = registry.get_tools_for_agent("Critic")
        assert len(critic_tools) == 1
        
        # Other agents get all tools (no specific assignment)
        other_tools = registry.get_tools_for_agent("Other")
        assert len(other_tools) == 1

    def test_get_tools_by_category(self):
        """Test getting tools by category."""
        registry = ToolRegistry()
        
        async def handler(query: str) -> list:
            return []
        
        registry.register(
            name="memory_tool",
            description="Memory tool",
            parameters={},
            handler=handler,
            category=ToolCategory.MEMORY,
        )
        
        registry.register(
            name="context_tool",
            description="Context tool",
            parameters={},
            handler=handler,
            category=ToolCategory.CONTEXT,
        )
        
        memory_tools = registry.get_tools_by_category(ToolCategory.MEMORY)
        assert len(memory_tools) == 1
        assert memory_tools[0].spec.name == "memory_tool"
        
        context_tools = registry.get_tools_by_category(ToolCategory.CONTEXT)
        assert len(context_tools) == 1
        assert context_tools[0].spec.name == "context_tool"

    def test_get_openai_functions(self):
        """Test getting tools in OpenAI format."""
        registry = ToolRegistry()
        
        async def handler(query: str) -> list:
            return []
        
        registry.register(
            name="test_tool",
            description="Test tool",
            parameters={"query": {"type": "string"}},
            handler=handler,
            required=["query"],
        )
        
        functions = registry.get_openai_functions()
        
        assert len(functions) == 1
        assert functions[0]["name"] == "test_tool"

    def test_get_anthropic_tools(self):
        """Test getting tools in Anthropic format."""
        registry = ToolRegistry()
        
        async def handler(query: str) -> list:
            return []
        
        registry.register(
            name="test_tool",
            description="Test tool",
            parameters={"query": {"type": "string"}},
            handler=handler,
            required=["query"],
        )
        
        tools = registry.get_anthropic_tools()
        
        assert len(tools) == 1
        assert tools[0]["name"] == "test_tool"

    @pytest.mark.asyncio
    async def test_execute_tool(self):
        """Test executing a tool through the registry."""
        registry = ToolRegistry()
        
        async def handler(query: str) -> list:
            return [{"result": query}]
        
        registry.register(
            name="test_tool",
            description="Test tool",
            parameters={"query": {"type": "string"}},
            handler=handler,
        )
        
        result = await registry.execute("test_tool", query="test")
        
        assert result.success is True
        assert result.data == [{"result": "test"}]

    @pytest.mark.asyncio
    async def test_execute_nonexistent_tool(self):
        """Test executing a non-existent tool returns error."""
        registry = ToolRegistry()
        
        result = await registry.execute("nonexistent", query="test")
        
        assert result.success is False
        assert "not found" in result.error


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_get_character_by_name_found(self):
        """Test finding a character by name."""
        state = BlackboardState()
        state.characters.characters = [
            {"name": "Alice", "role": "protagonist"},
            {"name": "Bob", "role": "antagonist"},
        ]
        ctx = RunContext(state=state)
        
        result = _get_character_by_name(ctx, "Alice")
        
        assert result["name"] == "Alice"
        assert result["role"] == "protagonist"

    def test_get_character_by_name_not_found(self):
        """Test character not found returns empty dict."""
        state = BlackboardState()
        state.characters.characters = [
            {"name": "Alice", "role": "protagonist"},
        ]
        ctx = RunContext(state=state)
        
        result = _get_character_by_name(ctx, "Charlie")
        
        assert result == {}

    def test_get_character_by_name_case_insensitive(self):
        """Test character search is case insensitive."""
        state = BlackboardState()
        state.characters.characters = [
            {"name": "Alice", "role": "protagonist"},
        ]
        ctx = RunContext(state=state)
        
        result = _get_character_by_name(ctx, "alice")
        
        assert result["name"] == "Alice"

    def test_get_character_by_name_no_context(self):
        """Test with no context returns empty dict."""
        result = _get_character_by_name(None, "Alice")
        
        assert result == {}

    def test_get_scene_context_basic(self):
        """Test getting scene context."""
        state = BlackboardState()
        state.drafting.current_scene = 2
        state.outline.scenes = [
            {"scene_number": 1, "description": "Scene 1"},
            {"scene_number": 2, "description": "Scene 2"},
            {"scene_number": 3, "description": "Scene 3"},
        ]
        ctx = RunContext(state=state)
        
        result = _get_scene_context(ctx)
        
        assert result["scene_number"] == 2
        assert result["total_scenes"] == 3
        assert result["current_scene_outline"]["scene_number"] == 2

    def test_get_scene_context_no_context(self):
        """Test with no context returns empty dict."""
        result = _get_scene_context(None)
        
        assert result == {}

    def test_summarize_text_short(self):
        """Test summarizing short text returns unchanged."""
        text = "This is a short text."
        
        result = _summarize_text(text, max_length=500)
        
        assert result == text

    def test_summarize_text_long(self):
        """Test summarizing long text truncates at sentence boundary."""
        text = "First sentence. Second sentence. Third sentence. Fourth sentence."
        
        result = _summarize_text(text, max_length=40)
        
        assert len(result) <= 43  # max_length + "..."
        assert result.endswith(".")

    def test_summarize_text_no_sentence_boundary(self):
        """Test summarizing text without good sentence boundary."""
        text = "A" * 100  # No periods
        
        result = _summarize_text(text, max_length=50)
        
        assert len(result) == 53  # 50 + "..."
        assert result.endswith("...")

    def test_check_consistency_no_context(self):
        """Test consistency check with no context."""
        result = _check_consistency(None, "Some text")
        
        assert result["consistent"] is True
        assert result["issues"] == []

    def test_check_consistency_basic(self):
        """Test basic consistency check."""
        state = BlackboardState()
        state.characters.characters = [
            {"name": "Alice"},
            {"name": "Bob"},
        ]
        ctx = RunContext(state=state)
        
        result = _check_consistency(ctx, "Alice and Bob talked.", aspects=["character_names"])
        
        assert result["consistent"] is True
        assert "character_names" in result["aspects_checked"]


class TestCreateDefaultTools:
    """Tests for create_default_tools function."""

    def test_create_default_tools_with_context(self):
        """Test creating default tools with a context."""
        state = BlackboardState()
        ctx = RunContext(state=state)
        
        registry = create_default_tools(ctx)
        
        # Check that expected tools are registered
        tools = registry.list_tools()
        assert "search_characters" in tools
        assert "search_worldbuilding" in tools
        assert "search_scenes" in tools
        assert "get_character" in tools
        assert "get_scene_context" in tools
        assert "summarize_text" in tools
        assert "check_consistency" in tools

    def test_create_default_tools_without_context(self):
        """Test creating default tools without a context."""
        registry = create_default_tools(None)
        
        # Tools should still be registered
        tools = registry.list_tools()
        assert len(tools) > 0
