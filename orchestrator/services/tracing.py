"""
Langfuse Tracing Service for MANOE Orchestrator.

Provides observability for LLM calls, agent interactions, and generation runs.
Integrates with self-hosted Langfuse instance.

Environment Variables:
    LANGFUSE_HOST: URL of Langfuse server (e.g., http://langfuse-web:3000)
    LANGFUSE_PUBLIC_KEY: Project public key from Langfuse UI
    LANGFUSE_SECRET_KEY: Project secret key from Langfuse UI
"""

import logging
import os
from contextlib import contextmanager
from functools import wraps
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Check if Langfuse is available
try:
    from langfuse import Langfuse
    from langfuse.decorators import observe
    LANGFUSE_AVAILABLE = True
except ImportError:
    LANGFUSE_AVAILABLE = False
    logger.warning("[Tracing] langfuse package not installed. Tracing disabled.")


class TracingService:
    """
    Singleton service for Langfuse tracing integration.

    Provides:
    - Trace creation for generation runs
    - Span tracking for agent calls
    - LLM call logging with token usage
    - Error tracking and debugging
    """

    _instance: Optional["TracingService"] = None
    _initialized: bool = False

    def __new__(cls) -> "TracingService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return

        self._client: Optional[Any] = None
        self._enabled: bool = False

        # Check environment variables
        host = os.getenv("LANGFUSE_HOST", "")
        public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
        secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")

        if not LANGFUSE_AVAILABLE:
            logger.info("[Tracing] Langfuse package not available. Tracing disabled.")
            self._initialized = True
            return

        if not all([host, public_key, secret_key]):
            missing = []
            if not host:
                missing.append("LANGFUSE_HOST")
            if not public_key:
                missing.append("LANGFUSE_PUBLIC_KEY")
            if not secret_key:
                missing.append("LANGFUSE_SECRET_KEY")
            logger.warning(f"[Tracing] Missing environment variables: {', '.join(missing)}. Tracing disabled.")
            self._initialized = True
            return

        try:
            self._client = Langfuse(
                host=host,
                public_key=public_key,
                secret_key=secret_key,
            )
            self._enabled = True
            logger.info(f"[Tracing] Langfuse initialized successfully. Host: {host}")
        except Exception as e:
            logger.error(f"[Tracing] Failed to initialize Langfuse: {e}")

        self._initialized = True

    @property
    def enabled(self) -> bool:
        """Check if tracing is enabled."""
        return self._enabled and self._client is not None

    @property
    def client(self) -> Optional[Any]:
        """Get the Langfuse client."""
        return self._client

    def create_trace(
        self,
        name: str,
        run_id: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[list] = None,
    ) -> Optional[Any]:
        """
        Create a new trace for a generation run.

        Args:
            name: Name of the trace (e.g., "generation_run")
            run_id: Unique identifier for the run
            user_id: Optional user identifier
            metadata: Optional metadata dict
            tags: Optional list of tags

        Returns:
            Langfuse trace object or None if tracing disabled
        """
        if not self.enabled:
            return None

        try:
            trace = self._client.trace(
                name=name,
                id=run_id,
                user_id=user_id,
                metadata=metadata or {},
                tags=tags or [],
            )
            logger.debug(f"[Tracing] Created trace: {name} (run_id={run_id})")
            return trace
        except Exception as e:
            logger.error(f"[Tracing] Failed to create trace: {e}")
            return None

    def create_span(
        self,
        trace_id: str,
        name: str,
        metadata: Optional[Dict[str, Any]] = None,
        input_data: Optional[Any] = None,
    ) -> Optional[Any]:
        """
        Create a span within a trace.

        Args:
            trace_id: ID of the parent trace
            name: Name of the span (e.g., "writer_agent")
            metadata: Optional metadata dict
            input_data: Optional input data

        Returns:
            Langfuse span object or None if tracing disabled
        """
        if not self.enabled:
            return None

        try:
            span = self._client.span(
                trace_id=trace_id,
                name=name,
                metadata=metadata or {},
                input=input_data,
            )
            logger.debug(f"[Tracing] Created span: {name} (trace_id={trace_id})")
            return span
        except Exception as e:
            logger.error(f"[Tracing] Failed to create span: {e}")
            return None

    def log_generation(
        self,
        trace_id: str,
        name: str,
        model: str,
        prompt: Any,
        completion: Any,
        usage: Optional[Dict[str, int]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Any]:
        """
        Log an LLM generation call.

        Args:
            trace_id: ID of the parent trace
            name: Name of the generation (e.g., "writer_draft")
            model: Model name (e.g., "gpt-4o")
            prompt: Input prompt/messages
            completion: Model output
            usage: Token usage dict (prompt_tokens, completion_tokens, total_tokens)
            metadata: Optional metadata dict

        Returns:
            Langfuse generation object or None if tracing disabled
        """
        if not self.enabled:
            return None

        try:
            generation = self._client.generation(
                trace_id=trace_id,
                name=name,
                model=model,
                input=prompt,
                output=completion,
                usage=usage,
                metadata=metadata or {},
            )
            logger.debug(f"[Tracing] Logged generation: {name} (model={model})")
            return generation
        except Exception as e:
            logger.error(f"[Tracing] Failed to log generation: {e}")
            return None

    def end_span(
        self,
        span: Any,
        output: Optional[Any] = None,
        status: str = "success",
        error: Optional[str] = None,
    ) -> None:
        """
        End a span with output and status.

        Args:
            span: Langfuse span object
            output: Output data
            status: Status string ("success" or "error")
            error: Error message if status is "error"
        """
        if not self.enabled or span is None:
            return

        try:
            span.end(
                output=output,
                level="ERROR" if status == "error" else "DEFAULT",
                status_message=error if error else None,
            )
        except Exception as e:
            logger.error(f"[Tracing] Failed to end span: {e}")

    def flush(self) -> None:
        """Flush all pending traces to Langfuse."""
        if not self.enabled:
            return

        try:
            self._client.flush()
            logger.debug("[Tracing] Flushed traces to Langfuse")
        except Exception as e:
            logger.error(f"[Tracing] Failed to flush traces: {e}")

    def shutdown(self) -> None:
        """Shutdown the tracing service."""
        if not self.enabled:
            return

        try:
            self._client.shutdown()
            logger.info("[Tracing] Langfuse client shutdown")
        except Exception as e:
            logger.error(f"[Tracing] Failed to shutdown: {e}")


# Global singleton instance
_tracing_service: Optional[TracingService] = None


def get_tracing_service() -> TracingService:
    """Get the global tracing service instance."""
    global _tracing_service
    if _tracing_service is None:
        _tracing_service = TracingService()
    return _tracing_service


@contextmanager
def trace_run(
    run_id: str,
    name: str = "generation_run",
    user_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Context manager for tracing a generation run.

    Usage:
        with trace_run(run_id="abc123", name="story_generation") as trace:
            # ... generation code ...
            pass
    """
    service = get_tracing_service()
    trace = service.create_trace(
        name=name,
        run_id=run_id,
        user_id=user_id,
        metadata=metadata,
    )
    try:
        yield trace
    finally:
        service.flush()


@contextmanager
def trace_agent(
    trace_id: str,
    agent_name: str,
    input_data: Optional[Any] = None,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Context manager for tracing an agent call.

    Usage:
        with trace_agent(trace_id, "Writer", input_data=prompt) as span:
            result = agent.run(prompt)
            span.output = result
    """
    service = get_tracing_service()
    span = service.create_span(
        trace_id=trace_id,
        name=agent_name,
        metadata=metadata,
        input_data=input_data,
    )

    class SpanContext:
        def __init__(self, span_obj):
            self._span = span_obj
            self.output = None
            self.error = None

    ctx = SpanContext(span)
    try:
        yield ctx
        service.end_span(span, output=ctx.output, status="success")
    except Exception as e:
        service.end_span(span, output=ctx.output, status="error", error=str(e))
        raise


def traced(name: Optional[str] = None):
    """
    Decorator for tracing a function.

    Usage:
        @traced("my_function")
        def my_function(arg1, arg2):
            return result
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if LANGFUSE_AVAILABLE and get_tracing_service().enabled:
                # Use langfuse's observe decorator if available
                return observe(name=name or func.__name__)(func)(*args, **kwargs)
            return func(*args, **kwargs)
        return wrapper
    return decorator
