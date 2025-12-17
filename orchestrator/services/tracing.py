"""
Langfuse Tracing Service for MANOE
Provides observability for agent calls, token usage, and latency tracking.
"""

import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from functools import wraps

try:
    from langfuse import Langfuse
    from langfuse.decorators import langfuse_context, observe
    LANGFUSE_AVAILABLE = True
except ImportError:
    LANGFUSE_AVAILABLE = False
    Langfuse = None
    langfuse_context = None
    observe = None


@dataclass
class TraceMetadata:
    """Metadata for a trace span."""
    run_id: str
    phase: str
    agent_name: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    latency_ms: float = 0
    success: bool = True
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class TracingService:
    """
    Service for tracing agent calls and orchestration steps using Langfuse.
    
    Provides:
    - Trace trees for full generation runs
    - Span tracking for individual agent calls
    - Token usage and latency metrics
    - Error tracking and debugging
    
    Falls back to no-op if Langfuse is not configured.
    """
    
    def __init__(self):
        self._client: Optional[Langfuse] = None
        self._enabled = False
        self._traces: Dict[str, Any] = {}  # run_id -> trace
        
    def initialize(
        self,
        public_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        host: Optional[str] = None,
    ) -> bool:
        """
        Initialize Langfuse client.
        
        Args:
            public_key: Langfuse public key (or LANGFUSE_PUBLIC_KEY env var)
            secret_key: Langfuse secret key (or LANGFUSE_SECRET_KEY env var)
            host: Langfuse host URL (or LANGFUSE_HOST env var)
            
        Returns:
            True if initialization successful, False otherwise
        """
        if not LANGFUSE_AVAILABLE:
            print("Langfuse not installed. Tracing disabled.")
            return False
            
        public_key = public_key or os.getenv("LANGFUSE_PUBLIC_KEY")
        secret_key = secret_key or os.getenv("LANGFUSE_SECRET_KEY")
        host = host or os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
        
        if not public_key or not secret_key:
            print("Langfuse keys not configured. Tracing disabled.")
            return False
            
        try:
            self._client = Langfuse(
                public_key=public_key,
                secret_key=secret_key,
                host=host,
            )
            self._enabled = True
            print(f"Langfuse tracing initialized. Host: {host}")
            return True
        except Exception as e:
            print(f"Failed to initialize Langfuse: {e}")
            return False
    
    @property
    def enabled(self) -> bool:
        """Check if tracing is enabled."""
        return self._enabled and self._client is not None
    
    def start_trace(
        self,
        run_id: str,
        name: str = "generation",
        metadata: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Optional[Any]:
        """
        Start a new trace for a generation run.
        
        Args:
            run_id: Unique identifier for the generation run
            name: Name of the trace
            metadata: Additional metadata to attach
            user_id: User identifier
            session_id: Session identifier
            
        Returns:
            Trace object or None if tracing disabled
        """
        if not self.enabled:
            return None
            
        try:
            trace = self._client.trace(
                id=run_id,
                name=name,
                metadata=metadata or {},
                user_id=user_id,
                session_id=session_id,
            )
            self._traces[run_id] = trace
            return trace
        except Exception as e:
            print(f"Failed to start trace: {e}")
            return None
    
    def get_trace(self, run_id: str) -> Optional[Any]:
        """Get an existing trace by run_id."""
        return self._traces.get(run_id)
    
    def end_trace(
        self,
        run_id: str,
        output: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        End a trace and flush to Langfuse.
        
        Args:
            run_id: Run identifier
            output: Final output of the generation
            metadata: Additional metadata to attach
        """
        if not self.enabled:
            return
            
        trace = self._traces.pop(run_id, None)
        if trace:
            try:
                trace.update(
                    output=output,
                    metadata=metadata,
                )
                self._client.flush()
            except Exception as e:
                print(f"Failed to end trace: {e}")
    
    @asynccontextmanager
    async def span(
        self,
        run_id: str,
        name: str,
        span_type: str = "span",
        input_data: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """
        Context manager for creating a span within a trace.
        
        Args:
            run_id: Run identifier
            name: Name of the span
            span_type: Type of span (span, generation, event)
            input_data: Input data for the span
            metadata: Additional metadata
            
        Yields:
            Span object or None if tracing disabled
        """
        if not self.enabled:
            yield None
            return
            
        trace = self._traces.get(run_id)
        if not trace:
            yield None
            return
            
        start_time = time.time()
        span = None
        
        try:
            span = trace.span(
                name=name,
                input=input_data,
                metadata=metadata or {},
            )
            yield span
        except Exception as e:
            if span:
                span.update(
                    level="ERROR",
                    status_message=str(e),
                )
            raise
        finally:
            if span:
                latency_ms = (time.time() - start_time) * 1000
                span.update(
                    metadata={
                        **(metadata or {}),
                        "latency_ms": latency_ms,
                    }
                )
    
    def log_generation(
        self,
        run_id: str,
        name: str,
        model: str,
        provider: str,
        input_messages: List[Dict[str, str]],
        output: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        latency_ms: float = 0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Log an LLM generation call.
        
        Args:
            run_id: Run identifier
            name: Name of the generation (e.g., agent name)
            model: Model used
            provider: LLM provider
            input_messages: Input messages sent to the model
            output: Model output
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            latency_ms: Latency in milliseconds
            metadata: Additional metadata
        """
        if not self.enabled:
            return
            
        trace = self._traces.get(run_id)
        if not trace:
            return
            
        try:
            trace.generation(
                name=name,
                model=model,
                input=input_messages,
                output=output,
                usage={
                    "input": input_tokens,
                    "output": output_tokens,
                    "total": input_tokens + output_tokens,
                },
                metadata={
                    "provider": provider,
                    "latency_ms": latency_ms,
                    **(metadata or {}),
                },
            )
        except Exception as e:
            print(f"Failed to log generation: {e}")
    
    def log_event(
        self,
        run_id: str,
        name: str,
        level: str = "DEFAULT",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Log an event within a trace.
        
        Args:
            run_id: Run identifier
            name: Event name
            level: Event level (DEFAULT, DEBUG, WARNING, ERROR)
            metadata: Additional metadata
        """
        if not self.enabled:
            return
            
        trace = self._traces.get(run_id)
        if not trace:
            return
            
        try:
            trace.event(
                name=name,
                level=level,
                metadata=metadata or {},
            )
        except Exception as e:
            print(f"Failed to log event: {e}")
    
    def log_error(
        self,
        run_id: str,
        error: str,
        phase: Optional[str] = None,
        agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Log an error within a trace.
        
        Args:
            run_id: Run identifier
            error: Error message
            phase: Phase where error occurred
            agent: Agent that caused the error
            metadata: Additional metadata
        """
        self.log_event(
            run_id=run_id,
            name=f"error_{phase or 'unknown'}_{agent or 'unknown'}",
            level="ERROR",
            metadata={
                "error": error,
                "phase": phase,
                "agent": agent,
                **(metadata or {}),
            },
        )
    
    def flush(self) -> None:
        """Flush all pending traces to Langfuse."""
        if self.enabled and self._client:
            try:
                self._client.flush()
            except Exception as e:
                print(f"Failed to flush traces: {e}")
    
    def shutdown(self) -> None:
        """Shutdown the tracing service."""
        self.flush()
        if self._client:
            try:
                self._client.shutdown()
            except Exception:
                pass
        self._client = None
        self._enabled = False
        self._traces.clear()


# Global tracing service instance
tracing_service = TracingService()


def trace_agent_call(agent_name: str, phase: str):
    """
    Decorator for tracing agent calls.
    
    Usage:
        @trace_agent_call("Writer", "drafting")
        async def run_drafting_phase(self, ...):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(self, *args, **kwargs):
            run_id = kwargs.get("run_id") or getattr(self, "_current_run_id", None)
            
            if not run_id or not tracing_service.enabled:
                return await func(self, *args, **kwargs)
            
            start_time = time.time()
            
            async with tracing_service.span(
                run_id=run_id,
                name=f"{phase}_{agent_name}",
                input_data={"args": str(args)[:500], "kwargs_keys": list(kwargs.keys())},
                metadata={"agent": agent_name, "phase": phase},
            ):
                try:
                    result = await func(self, *args, **kwargs)
                    latency_ms = (time.time() - start_time) * 1000
                    
                    tracing_service.log_event(
                        run_id=run_id,
                        name=f"{agent_name}_complete",
                        metadata={
                            "phase": phase,
                            "latency_ms": latency_ms,
                            "success": True,
                        },
                    )
                    
                    return result
                except Exception as e:
                    tracing_service.log_error(
                        run_id=run_id,
                        error=str(e),
                        phase=phase,
                        agent=agent_name,
                    )
                    raise
        
        return wrapper
    return decorator
