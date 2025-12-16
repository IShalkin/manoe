"""
Multi-Agent Worker for MANOE
Integrates StorytellerGroupChat with Redis Streams for real-time event publishing.
"""

import asyncio
import json
import os
import uuid
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field, SecretStr

from autogen_orchestrator import StorytellerGroupChat
from config import (
    AgentModelConfig,
    ClaudeConfig,
    DeepSeekConfig,
    GeminiConfig,
    LLMConfiguration,
    LLMProvider,
    OpenAIConfig,
    OpenRouterConfig,
    create_default_config_from_env,
)
from models import StoryProject
from services.redis_streams import RedisStreamsService
from services.security import (
    ALLOWED_ORIGINS,
    MAX_CUSTOM_MORAL_LENGTH,
    MAX_SEED_IDEA_LENGTH,
    MAX_THEMES_LENGTH,
    MAX_TONE_STYLE_LENGTH,
    check_run_ownership,
    get_current_user,
    run_ownership,
)
from services.supabase_persistence import SupabasePersistenceService
from services.research_service import ResearchService, ResearchProvider
from services.research_memory import ResearchMemoryService

load_dotenv()


class MultiAgentWorker:
    """
    Worker that runs multi-agent generation and publishes events to Redis Streams.
    """

    def __init__(self):
        self.config = create_default_config_from_env()
        self.redis_streams: Optional[RedisStreamsService] = None
        self.persistence_service: Optional[SupabasePersistenceService] = None
        self._running = False
        self._active_runs: Dict[str, asyncio.Task] = {}
        self._cancelled_runs: set = set()
        self._paused_runs: set = set()

    async def initialize(self) -> None:
        """Initialize Redis Streams and Supabase persistence connections."""
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_streams = RedisStreamsService(redis_url)
        await self.redis_streams.connect()
        print(f"Multi-Agent Worker connected to Redis at {redis_url}")

        self.persistence_service = SupabasePersistenceService()
        if await self.persistence_service.connect():
            print("Multi-Agent Worker connected to Supabase for artifact persistence")
        else:
            print("Supabase persistence not available - artifacts will not be persisted")

    async def shutdown(self) -> None:
        """Shutdown the worker."""
        self._running = False
        if self.redis_streams:
            await self.redis_streams.disconnect()

    def _create_event_callback(self, run_id: str):
        """Create an event callback that publishes to Redis Streams."""
        # Store pending tasks to ensure they complete before generation_complete
        self._pending_event_tasks: list = []

        async def callback(event_type: str, data: Dict[str, Any]) -> None:
            if self.redis_streams:
                await self.redis_streams.publish_event(run_id, event_type, data)

        # Return a sync wrapper since StorytellerGroupChat expects sync callback
        def sync_callback(event_type: str, data: Dict[str, Any]) -> None:
            task = asyncio.create_task(callback(event_type, data))
            self._pending_event_tasks.append(task)

        return sync_callback

    async def _flush_pending_events(self) -> None:
        """Wait for all pending event tasks to complete."""
        if hasattr(self, '_pending_event_tasks') and self._pending_event_tasks:
            await asyncio.gather(*self._pending_event_tasks, return_exceptions=True)
            self._pending_event_tasks.clear()

    async def run_generation(
        self,
        run_id: str,
        project_data: Dict[str, Any],
        api_key: str,
        provider: str = "openai",
        model: str = "gpt-4o",
        constraints: Optional[Dict[str, Any]] = None,
        generation_mode: str = "demo",
        target_word_count: int = 50000,
        estimated_scenes: int = 20,
        preferred_structure: str = "ThreeAct",
        max_revisions: int = 2,
        narrator_config: Optional[Dict[str, Any]] = None,
        start_from_phase: Optional[str] = None,
        previous_run_id: Optional[str] = None,
        edited_content: Optional[Dict[str, Any]] = None,
        scenes_to_regenerate: Optional[List[int]] = None,
        supabase_project_id: Optional[str] = None,
        selected_narrative: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run multi-agent generation for a project.

        Args:
            run_id: Unique identifier for this generation run
            project_data: Project configuration data
            api_key: User's API key for the LLM provider
            provider: LLM provider to use (default: openai)
            start_from_phase: Phase to start from (for partial regeneration)
            previous_run_id: Run ID to load previous artifacts from
            edited_content: User-edited content to use instead of regenerating
            scenes_to_regenerate: Optional list of scene numbers to regenerate (1-indexed)
            selected_narrative: Pre-selected narrative from branching UI

        Returns:
            Generation results including all agent messages
        """
        # Log incoming parameters
        import logging
        logger = logging.getLogger("orchestrator")
        logger.info(f"[run_generation] Starting with run_id={run_id}")
        logger.info(f"[run_generation] provider='{provider}', model='{model}'")
        logger.info(f"[run_generation] api_key provided: {bool(api_key)}, api_key length: {len(api_key) if api_key else 0}")
        
        # Publish start event
        is_regeneration = start_from_phase is not None
        await self.redis_streams.publish_event(
            run_id,
            "generation_start",
            {
                "run_id": run_id,
                "project": project_data,
                "status": "starting",
                "regeneration_mode": is_regeneration,
                "start_from_phase": start_from_phase,
            }
        )

        try:
            # Create project from data
            project = StoryProject.model_validate(project_data)

            # Create config with user's API key for this request
            # Map frontend provider names to backend config classes and LLMProvider enum
            provider_lower = provider.lower()

            # Map provider string to LLMProvider enum
            provider_enum_map = {
                "openai": LLMProvider.OPENAI,
                "anthropic": LLMProvider.CLAUDE,
                "claude": LLMProvider.CLAUDE,
                "gemini": LLMProvider.GEMINI,
                "openrouter": LLMProvider.OPENROUTER,
                "deepseek": LLMProvider.DEEPSEEK,
            }
            llm_provider = provider_enum_map.get(provider_lower, LLMProvider.OPENAI)

            # Create agent model config - all agents use the same provider/model for now
            agent_models = AgentModelConfig(
                architect_provider=llm_provider,
                architect_model=model,
                profiler_provider=llm_provider,
                profiler_model=model,
                worldbuilder_provider=llm_provider,
                worldbuilder_model=model,
                strategist_provider=llm_provider,
                strategist_model=model,
                writer_provider=llm_provider,
                writer_model=model,
                critic_provider=llm_provider,
                critic_model=model,
                polish_provider=llm_provider,
                polish_model=model,
            )

            request_config = LLMConfiguration(
                openai=OpenAIConfig(api_key=SecretStr(api_key)) if provider_lower == "openai" else None,
                claude=ClaudeConfig(api_key=SecretStr(api_key)) if provider_lower in ["anthropic", "claude"] else None,
                gemini=GeminiConfig(api_key=SecretStr(api_key)) if provider_lower == "gemini" else None,
                openrouter=OpenRouterConfig(api_key=SecretStr(api_key)) if provider_lower == "openrouter" else None,
                deepseek=DeepSeekConfig(api_key=SecretStr(api_key)) if provider_lower == "deepseek" else None,
                agent_models=agent_models,
            )

            # Create group chat with event callback and user's config
            event_callback = self._create_event_callback(run_id)

            # Create pause check callback that checks if this run is paused
            def pause_check_callback() -> bool:
                return run_id in self._paused_runs

            group_chat = StorytellerGroupChat(
                config=request_config,
                event_callback=event_callback,
                pause_check_callback=pause_check_callback,
            )

            # Publish agent initialization event
            await self.redis_streams.publish_event(
                run_id,
                "agents_initialized",
                {
                    "agents": ["Architect", "Profiler", "Strategist", "Writer", "Critic"],
                    "status": "ready",
                }
            )

            # Load previous artifacts if regenerating
            previous_artifacts = None
            if is_regeneration and previous_run_id and self.persistence_service and self.persistence_service.is_connected:
                previous_artifacts = await self.persistence_service.get_run_artifacts(previous_run_id)
                await self.redis_streams.publish_event(
                    run_id,
                    "artifacts_loaded",
                    {
                        "previous_run_id": previous_run_id,
                        "phases_loaded": list(previous_artifacts.keys()) if previous_artifacts else [],
                    }
                )

            # Run generation based on selected mode
            if generation_mode == "full":
                # Full pipeline: Genesis → Characters → Worldbuilding → Outlining → Drafting with Writer↔Critic loop
                # Pass OpenAI API key for Qdrant memory embeddings (only works with OpenAI provider)
                openai_key = api_key if provider == "openai" else None

                # Extract change_request from constraints if available
                # This is the "What did you change?" field from the frontend
                change_request = None
                if constraints and constraints.get("edit_comment"):
                    change_request = constraints["edit_comment"]

                result = await group_chat.run_full_generation(
                    project,
                    target_word_count=target_word_count,
                    estimated_scenes=estimated_scenes,
                    preferred_structure=preferred_structure,
                    openai_api_key=openai_key,
                    max_revisions=max_revisions,
                    narrator_config=narrator_config,
                    run_id=run_id,
                    persistence_service=self.persistence_service,
                    start_from_phase=start_from_phase,
                    previous_artifacts=previous_artifacts,
                    edited_content=edited_content,
                    scenes_to_regenerate=scenes_to_regenerate,
                    previous_run_id=previous_run_id,
                    change_request=change_request,
                    supabase_project_id=supabase_project_id,
                    selected_narrative=selected_narrative,
                )
            else:
                # Demo mode: Quick preview with all 5 agents in simplified flow
                result = await group_chat.run_demo_generation(project, constraints=constraints, narrator_config=narrator_config)

            # Flush all pending events before publishing completion
            # This ensures agent_complete events arrive before generation_complete
            await self._flush_pending_events()

            # Publish completion event
            await self.redis_streams.publish_event(
                run_id,
                "generation_complete",
                {
                    "run_id": run_id,
                    "status": "completed",
                    "result_summary": str(result.get("narrative_possibility", {}))[:500],
                    "regeneration_mode": is_regeneration,
                }
            )

            return {
                "success": True,
                "run_id": run_id,
                "result": result,
            }

        except Exception as e:
            # Log full traceback for debugging
            import traceback
            error_traceback = traceback.format_exc()
            print(f"Generation error for run {run_id}:\n{error_traceback}")
            
            # Publish error event
            await self.redis_streams.publish_event(
                run_id,
                "generation_error",
                {
                    "run_id": run_id,
                    "status": "error",
                    "error": str(e),
                    "traceback": error_traceback,
                }
            )
            return {
                "success": False,
                "run_id": run_id,
                "error": str(e),
            }

    async def run_narrative_possibilities(
        self,
        run_id: str,
        project_data: Dict[str, Any],
        api_key: str,
        provider: str = "openai",
        model: str = "gpt-4o",
    ) -> Dict[str, Any]:
        """
        Generate multiple narrative possibilities (3-5) for user selection.

        This implements the Narrative Possibilities Branching feature from
        Storyteller Framework Section 1.4. Instead of generating a single
        narrative direction, this generates multiple distinct possibilities
        for the user to choose from.

        Args:
            run_id: Unique identifier for this generation run
            project_data: Project configuration data
            api_key: User's API key for the LLM provider
            provider: LLM provider to use (default: openai)
            model: Model to use for generation

        Returns:
            Dict containing narrative_possibilities array and recommendation
        """
        # Publish start event
        await self.redis_streams.publish_event(
            run_id,
            "narrative_possibilities_start",
            {
                "run_id": run_id,
                "project": project_data,
                "status": "generating_possibilities",
            }
        )

        try:
            # Create project from data
            project = StoryProject.model_validate(project_data)

            # Create config with user's API key for this request
            provider_lower = provider.lower()

            # Map provider string to LLMProvider enum
            provider_enum_map = {
                "openai": LLMProvider.OPENAI,
                "anthropic": LLMProvider.CLAUDE,
                "claude": LLMProvider.CLAUDE,
                "gemini": LLMProvider.GEMINI,
                "openrouter": LLMProvider.OPENROUTER,
                "deepseek": LLMProvider.DEEPSEEK,
            }
            llm_provider = provider_enum_map.get(provider_lower, LLMProvider.OPENAI)

            # Create agent model config
            agent_models = AgentModelConfig(
                architect_provider=llm_provider,
                architect_model=model,
                profiler_provider=llm_provider,
                profiler_model=model,
                worldbuilder_provider=llm_provider,
                worldbuilder_model=model,
                strategist_provider=llm_provider,
                strategist_model=model,
                writer_provider=llm_provider,
                writer_model=model,
                critic_provider=llm_provider,
                critic_model=model,
                polish_provider=llm_provider,
                polish_model=model,
            )

            request_config = LLMConfiguration(
                openai=OpenAIConfig(api_key=SecretStr(api_key)) if provider_lower == "openai" else None,
                claude=ClaudeConfig(api_key=SecretStr(api_key)) if provider_lower in ["anthropic", "claude"] else None,
                gemini=GeminiConfig(api_key=SecretStr(api_key)) if provider_lower == "gemini" else None,
                openrouter=OpenRouterConfig(api_key=SecretStr(api_key)) if provider_lower == "openrouter" else None,
                deepseek=DeepSeekConfig(api_key=SecretStr(api_key)) if provider_lower == "deepseek" else None,
                agent_models=agent_models,
            )

            # Create group chat with event callback
            event_callback = self._create_event_callback(run_id)

            group_chat = StorytellerGroupChat(
                config=request_config,
                event_callback=event_callback,
            )

            # Run narrative possibilities generation
            result = await group_chat.run_narrative_possibilities(project)

            # Flush all pending events before publishing completion
            await self._flush_pending_events()

            # Publish completion event with possibilities
            await self.redis_streams.publish_event(
                run_id,
                "narrative_possibilities_complete",
                {
                    "run_id": run_id,
                    "status": "completed",
                    "count": len(result.get("narrative_possibilities", [])),
                    "narrative_possibilities": result.get("narrative_possibilities", []),
                    "recommendation": result.get("recommendation", {}),
                }
            )

            return {
                "success": True,
                "run_id": run_id,
                "narrative_possibilities": result.get("narrative_possibilities", []),
                "recommendation": result.get("recommendation", {}),
            }

        except Exception as e:
            # Log full traceback for debugging
            import traceback
            error_traceback = traceback.format_exc()
            print(f"Narrative possibilities error for run {run_id}:\n{error_traceback}")
            
            # Publish error event
            await self.redis_streams.publish_event(
                run_id,
                "narrative_possibilities_error",
                {
                    "run_id": run_id,
                    "status": "error",
                    "error": str(e),
                    "traceback": error_traceback,
                }
            )
            return {
                "success": False,
                "run_id": run_id,
                "error": str(e),
            }


# HTTP API for triggering generation
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="MANOE Multi-Agent Orchestrator")

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration with explicit allowed origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

worker: Optional[MultiAgentWorker] = None


class RegenerationConstraints(BaseModel):
    """Constraints for partial regeneration with edited/locked agent outputs."""
    edited_agent: str  # Which agent was edited
    edited_content: str  # The edited content
    edit_comment: str  # User's description of what they changed
    locked_agents: Dict[str, str]  # Agent name -> locked content
    agents_to_regenerate: List[str]  # Which agents to regenerate


class NarratorConfig(BaseModel):
    """Narrator design configuration based on Storyteller Framework Section 3.2."""
    pov: str = "third_person_limited"  # first_person, third_person_limited, third_person_omniscient, second_person
    reliability: str = "reliable"  # reliable, unreliable
    stance: str = "objective"  # objective, judgmental, sympathetic


class GenerateRequest(BaseModel):
    seed_idea: str = Field(..., max_length=MAX_SEED_IDEA_LENGTH)
    moral_compass: str = "ambiguous"
    custom_moral_system: Optional[str] = Field(None, max_length=MAX_CUSTOM_MORAL_LENGTH)
    target_audience: str = Field("", max_length=1000)
    themes: Optional[str] = Field(None, max_length=MAX_THEMES_LENGTH)
    tone_style_references: Optional[str] = Field(None, max_length=MAX_TONE_STYLE_LENGTH)
    provider: str = "openai"
    model: str = "gpt-4o"
    api_key: str
    constraints: Optional[RegenerationConstraints] = None  # For partial regeneration
    generation_mode: str = "demo"  # "demo" for quick preview, "full" for complete pipeline, "branching" for narrative possibilities
    target_word_count: int = Field(50000, ge=1000, le=500000)  # For full mode
    estimated_scenes: int = Field(20, ge=1, le=200)  # For full mode
    preferred_structure: str = "ThreeAct"  # For full mode
    max_revisions: int = Field(2, ge=1, le=10)  # Maximum Writer↔Critic revision cycles per scene
    narrator_config: Optional[NarratorConfig] = None  # Narrator design settings
    start_from_phase: Optional[str] = None  # Phase to start from (for phase-based regeneration)
    previous_run_id: Optional[str] = None  # Run ID to load previous artifacts from
    edited_content: Optional[Dict[str, Any]] = None  # User-edited content to use instead of regenerating
    scenes_to_regenerate: Optional[List[int]] = None  # Scene numbers to regenerate (1-indexed)
    supabase_project_id: Optional[str] = None  # Supabase project UUID for artifact persistence
    selected_narrative: Optional[Dict[str, Any]] = None  # Pre-selected narrative from branching UI


class GenerateResponse(BaseModel):
    success: bool
    run_id: str
    message: str


@app.on_event("startup")
async def startup():
    global worker
    worker = MultiAgentWorker()
    await worker.initialize()


@app.on_event("shutdown")
async def shutdown():
    global worker
    if worker:
        await worker.shutdown()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "manoe-multi-agent-orchestrator"}


@app.post("/generate", response_model=GenerateResponse)
@limiter.limit("10/minute")
async def generate(gen_request: GenerateRequest, request: Request):
    """Start a multi-agent generation run. Requires authentication."""
    if not worker:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    # Authenticate user
    user_id, _ = await get_current_user(request)

    run_id = str(uuid.uuid4())

    # Register run ownership
    run_ownership.register_run(run_id, user_id)

    # Capitalize moral_compass to match enum values (Ethical, Unethical, Amoral, Ambiguous, UserDefined)
    moral_compass_capitalized = gen_request.moral_compass.capitalize() if gen_request.moral_compass else "Ambiguous"

    project_data = {
        "seed_idea": gen_request.seed_idea,
        "moral_compass": moral_compass_capitalized,
        "custom_moral_system": gen_request.custom_moral_system if moral_compass_capitalized == "UserDefined" else None,
        "target_audience": gen_request.target_audience,
        "theme_core": gen_request.themes.split(",") if gen_request.themes else [],
        "tone_style_references": gen_request.tone_style_references.split(",") if gen_request.tone_style_references else None,
    }

    # Convert constraints to dict if provided
    constraints_dict = None
    if gen_request.constraints:
        constraints_dict = {
            "edited_agent": gen_request.constraints.edited_agent,
            "edited_content": gen_request.constraints.edited_content,
            "edit_comment": gen_request.constraints.edit_comment,
            "locked_agents": gen_request.constraints.locked_agents,
            "agents_to_regenerate": gen_request.constraints.agents_to_regenerate,
        }

    # Convert narrator_config to dict if provided
    narrator_config_dict = None
    if gen_request.narrator_config:
        narrator_config_dict = {
            "pov": gen_request.narrator_config.pov,
            "reliability": gen_request.narrator_config.reliability,
            "stance": gen_request.narrator_config.stance,
        }

    # Handle branching mode - generate narrative possibilities instead of full generation
    if gen_request.generation_mode == "branching":
        task = asyncio.create_task(worker.run_narrative_possibilities(
            run_id=run_id,
            project_data=project_data,
            api_key=gen_request.api_key,
            provider=gen_request.provider,
            model=gen_request.model,
        ))

        # Track active run for cancellation support
        worker._active_runs[run_id] = task

        return GenerateResponse(
            success=True,
            run_id=run_id,
            message="Generating narrative possibilities. Connect to SSE endpoint for real-time updates.",
        )

    # Start generation in background with user's API key
    task = asyncio.create_task(worker.run_generation(
        run_id=run_id,
        project_data=project_data,
        api_key=gen_request.api_key,
        provider=gen_request.provider,
        model=gen_request.model,
        constraints=constraints_dict,
        generation_mode=gen_request.generation_mode,
        target_word_count=gen_request.target_word_count,
        estimated_scenes=gen_request.estimated_scenes,
        preferred_structure=gen_request.preferred_structure,
        max_revisions=gen_request.max_revisions,
        narrator_config=narrator_config_dict,
        start_from_phase=gen_request.start_from_phase,
        previous_run_id=gen_request.previous_run_id,
        edited_content=gen_request.edited_content,
        scenes_to_regenerate=gen_request.scenes_to_regenerate,
        supabase_project_id=gen_request.supabase_project_id,
        selected_narrative=gen_request.selected_narrative,
    ))

    # Track active run for cancellation support
    worker._active_runs[run_id] = task

    return GenerateResponse(
        success=True,
        run_id=run_id,
        message="Generation started. Connect to SSE endpoint for real-time updates.",
    )


@app.get("/runs/{run_id}/events")
async def stream_events(run_id: str, request: Request):
    """Stream events for a generation run via SSE. Requires authentication and ownership."""
    if not worker or not worker.redis_streams:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    # Authenticate user and verify ownership
    user_id, _ = await get_current_user(request)
    check_run_ownership(run_id, user_id)

    async def event_generator():
        # First, get any existing events
        existing = await worker.redis_streams.get_events(run_id, start_id="0", count=1000)
        last_id = "0"
        for event in existing:
            yield f"data: {json.dumps(event)}\n\n"
            # Track last event ID for continuation
            if "id" in event:
                last_id = event["id"]
            # Stop if generation already completed or errored
            if event.get("type") in ["generation_complete", "generation_error"]:
                return

        # Then stream new events from where we left off (not from $)
        async for event in worker.redis_streams.stream_events(run_id, start_id=last_id):
            yield f"data: {json.dumps(event)}\n\n"

            # Stop streaming if generation is complete or errored
            if event.get("type") in ["generation_complete", "generation_error"]:
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/runs/{run_id}/messages")
async def get_messages(run_id: str, request: Request):
    """Get all agent messages for a run. Requires authentication and ownership."""
    if not worker or not worker.redis_streams:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    # Authenticate user and verify ownership
    user_id, _ = await get_current_user(request)
    check_run_ownership(run_id, user_id)

    events = await worker.redis_streams.get_events(run_id, start_id="0", count=1000)

    # Filter to agent-related events
    agent_messages = []
    for event in events:
        if event.get("type") in ["agent_start", "agent_complete", "agent_message"]:
            agent_messages.append(event)

    return {"run_id": run_id, "messages": agent_messages}


@app.post("/runs/{run_id}/cancel")
async def cancel_generation(run_id: str, request: Request):
    """Cancel an active generation run. Requires authentication and ownership."""
    if not worker or not worker.redis_streams:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    # Authenticate user and verify ownership
    user_id, _ = await get_current_user(request)
    check_run_ownership(run_id, user_id)

    # Mark the run as cancelled
    worker._cancelled_runs.add(run_id)

    # Cancel the task if it exists
    if run_id in worker._active_runs:
        task = worker._active_runs[run_id]
        if not task.done():
            task.cancel()
        del worker._active_runs[run_id]

    # Publish cancellation event
    await worker.redis_streams.publish_event(
        run_id,
        "generation_cancelled",
        {
            "run_id": run_id,
            "status": "cancelled",
            "message": "Generation was cancelled by user",
        }
    )

    return {"success": True, "run_id": run_id, "message": "Generation cancelled"}


@app.post("/runs/{run_id}/pause")
async def pause_generation(run_id: str, request: Request):
    """Pause an active generation run. Requires authentication and ownership."""
    if not worker or not worker.redis_streams:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    # Authenticate user and verify ownership
    user_id, _ = await get_current_user(request)
    check_run_ownership(run_id, user_id)

    # Check if run exists and is active
    if run_id not in worker._active_runs:
        raise HTTPException(status_code=404, detail="Run not found or not active")

    # Check if already paused
    if run_id in worker._paused_runs:
        return {"success": True, "run_id": run_id, "message": "Generation already paused"}

    # Mark the run as paused
    worker._paused_runs.add(run_id)

    # Publish pause event
    await worker.redis_streams.publish_event(
        run_id,
        "generation_paused",
        {
            "run_id": run_id,
            "status": "paused",
            "message": "Generation paused by user",
        }
    )

    return {"success": True, "run_id": run_id, "message": "Generation paused"}


@app.post("/runs/{run_id}/resume")
async def resume_generation(run_id: str, request: Request):
    """Resume a paused generation run. Requires authentication and ownership."""
    if not worker or not worker.redis_streams:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    # Authenticate user and verify ownership
    user_id, _ = await get_current_user(request)
    check_run_ownership(run_id, user_id)

    # Check if run is paused
    if run_id not in worker._paused_runs:
        raise HTTPException(status_code=400, detail="Run is not paused")

    # Remove from paused set
    worker._paused_runs.discard(run_id)

    # Publish resume event
    await worker.redis_streams.publish_event(
        run_id,
        "generation_resumed",
        {
            "run_id": run_id,
            "status": "running",
            "message": "Generation resumed by user",
        }
    )

    return {"success": True, "run_id": run_id, "message": "Generation resumed"}


@app.get("/runs/{run_id}/status")
async def get_run_status(run_id: str, request: Request):
    """Get the status of a generation run. Requires authentication and ownership."""
    if not worker:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    # Authenticate user and verify ownership
    user_id, _ = await get_current_user(request)
    check_run_ownership(run_id, user_id)

    status = "unknown"
    if run_id in worker._cancelled_runs:
        status = "cancelled"
    elif run_id in worker._paused_runs:
        status = "paused"
    elif run_id in worker._active_runs:
        task = worker._active_runs[run_id]
        if task.done():
            status = "completed"
        else:
            status = "running"
    else:
        status = "not_found"

    return {"run_id": run_id, "status": status}


class ModelsRequest(BaseModel):
    provider: str
    api_key: str


class ModelInfo(BaseModel):
    id: str
    name: str
    context_length: Optional[int] = None
    description: Optional[str] = None


class ModelsResponse(BaseModel):
    success: bool
    models: Optional[List[ModelInfo]] = None
    error: Optional[str] = None


class ResearchRequest(BaseModel):
    """Request model for market research."""
    seed_idea: str = Field(..., max_length=MAX_SEED_IDEA_LENGTH)
    target_audience: str = Field("", max_length=1000)
    themes: Optional[str] = Field(None, max_length=MAX_THEMES_LENGTH)
    moral_compass: str = "ambiguous"
    provider: str = Field(..., description="Research provider: openai_deep_research or perplexity")
    api_key: str = Field(..., description="API key for the research provider")
    model: Optional[str] = Field(None, description="Optional model override")
    project_id: Optional[str] = Field(None, description="Optional project ID to link research to")
    reuse_policy: str = Field("auto", description="Reuse policy: auto, force_new, force_reuse")
    similarity_threshold: float = Field(0.8, description="Similarity threshold for reuse (0.0-1.0)")


class ResearchResponse(BaseModel):
    """Response model for market research."""
    success: bool
    provider: Optional[str] = None
    model: Optional[str] = None
    content: Optional[str] = None
    prompt_context: Optional[str] = None
    citations: Optional[List[Dict[str, Any]]] = None
    search_results: Optional[List[Dict[str, Any]]] = None
    web_searches: Optional[List[Dict[str, Any]]] = None
    usage: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    research_id: Optional[str] = None
    reused: bool = False
    similarity_score: Optional[float] = None


research_service: Optional[ResearchService] = None
research_memory_service: Optional[ResearchMemoryService] = None
supabase_service: Optional[SupabasePersistenceService] = None


async def get_research_services():
    """Initialize and return research services."""
    global research_service, research_memory_service, supabase_service
    
    if research_service is None:
        research_service = ResearchService()
        await research_service.initialize()
    
    if research_memory_service is None:
        research_memory_service = ResearchMemoryService()
        await research_memory_service.initialize()
    
    if supabase_service is None:
        supabase_service = SupabasePersistenceService()
        supabase_service.connect()
    
    return research_service, research_memory_service, supabase_service


@app.post("/research", response_model=ResearchResponse)
@limiter.limit("5/minute")
async def conduct_research(research_request: ResearchRequest, request: Request):
    """
    Conduct market research using OpenAI Deep Research or Perplexity APIs.
    
    Implements "Eternal Memory" - checks for similar past research before conducting new research.
    
    Supported providers:
    - openai_deep_research: Uses OpenAI's o3-deep-research or o4-mini-deep-research models
    - perplexity: Uses Perplexity's sonar-deep-research model
    
    Reuse policies:
    - auto: Check for similar research, reuse if similarity > threshold
    - force_new: Always conduct new research
    - force_reuse: Only return existing research (fail if none found)
    
    Requires authentication.
    """
    user_id, _ = await get_current_user(request)
    
    rs, rms, supa = await get_research_services()
    
    themes_list = []
    if research_request.themes:
        themes_list = [t.strip() for t in research_request.themes.split(",") if t.strip()]
    
    query_text = f"{research_request.seed_idea} | {research_request.target_audience} | {','.join(themes_list)} | {research_request.moral_compass}"
    
    if research_request.reuse_policy != "force_new":
        try:
            similar_results = await rms.search_similar_research(
                query_text=query_text,
                user_id=user_id,
                limit=1,
                score_threshold=research_request.similarity_threshold,
            )
            
            if similar_results:
                best_match = similar_results[0]
                similarity_score = best_match.get("score", 0)
                research_id = best_match.get("payload", {}).get("research_id")
                
                if research_id:
                    existing = await supa.get_research_result_by_id(research_id)
                    if existing:
                        return ResearchResponse(
                            success=True,
                            provider=existing.get("provider"),
                            model=existing.get("model"),
                            content=existing.get("content"),
                            prompt_context=existing.get("prompt_context"),
                            citations=existing.get("citations"),
                            search_results=existing.get("search_results"),
                            web_searches=existing.get("web_searches"),
                            usage=existing.get("usage"),
                            research_id=research_id,
                            reused=True,
                            similarity_score=similarity_score,
                        )
        except Exception as e:
            print(f"Error searching similar research: {e}")
            if research_request.reuse_policy == "force_reuse":
                return ResearchResponse(
                    success=False,
                    error=f"No similar research found and force_reuse policy set: {e}",
                )
    
    if research_request.reuse_policy == "force_reuse":
        return ResearchResponse(
            success=False,
            error="No similar research found and force_reuse policy set",
        )
    
    result = await rs.conduct_research(
        provider=research_request.provider,
        api_key=research_request.api_key,
        seed_idea=research_request.seed_idea,
        target_audience=research_request.target_audience,
        themes=themes_list,
        moral_compass=research_request.moral_compass,
        model=research_request.model,
    )
    
    if not result.get("success"):
        return ResearchResponse(
            success=False,
            error=result.get("error", "Research failed"),
        )
    
    qdrant_point_id = None
    try:
        qdrant_point_id = await rms.store_research(
            research_id="pending",
            user_id=user_id,
            query_text=query_text,
            seed_idea=research_request.seed_idea,
            target_audience=research_request.target_audience,
            themes=themes_list,
            moral_compass=research_request.moral_compass,
            provider=result.get("provider", ""),
            model=result.get("model"),
        )
    except Exception as e:
        print(f"Error storing research in Qdrant: {e}")
    
    research_id = None
    try:
        research_id = await supa.store_research_result(
            user_id=user_id,
            provider=result.get("provider", ""),
            model=result.get("model"),
            seed_idea=research_request.seed_idea,
            target_audience=research_request.target_audience,
            themes=themes_list,
            moral_compass=research_request.moral_compass,
            content=result.get("content", ""),
            prompt_context=result.get("prompt_context"),
            citations=result.get("citations"),
            search_results=result.get("search_results"),
            web_searches=result.get("web_searches"),
            usage=result.get("usage"),
            project_id=research_request.project_id,
            qdrant_point_id=qdrant_point_id,
        )
        
        if research_id and qdrant_point_id:
            try:
                await rms.update_research_id(qdrant_point_id, research_id)
            except Exception as e:
                print(f"Error updating Qdrant with research_id: {e}")
    except Exception as e:
        print(f"Error storing research in Supabase: {e}")
    
    return ResearchResponse(
        success=True,
        provider=result.get("provider"),
        model=result.get("model"),
        content=result.get("content"),
        prompt_context=result.get("prompt_context"),
        citations=result.get("citations"),
        search_results=result.get("search_results"),
        web_searches=result.get("web_searches"),
        usage=result.get("usage"),
        research_id=research_id,
        reused=False,
    )


class ResearchHistoryResponse(BaseModel):
    """Response model for research history."""
    success: bool
    research: List[Dict[str, Any]] = []
    error: Optional[str] = None


class SimilarResearchRequest(BaseModel):
    """Request model for similar research search."""
    seed_idea: str = Field(..., max_length=MAX_SEED_IDEA_LENGTH)
    target_audience: str = Field("", max_length=1000)
    themes: Optional[str] = Field(None, max_length=MAX_THEMES_LENGTH)
    moral_compass: str = "ambiguous"
    similarity_threshold: float = Field(0.5, description="Minimum similarity score (0.0-1.0)")
    limit: int = Field(5, description="Maximum number of results")


class SimilarResearchResponse(BaseModel):
    """Response model for similar research search."""
    success: bool
    similar_research: List[Dict[str, Any]] = []
    error: Optional[str] = None


@app.get("/research/history", response_model=ResearchHistoryResponse)
@limiter.limit("30/minute")
async def get_research_history(
    request: Request,
    project_id: Optional[str] = None,
    limit: int = 20,
):
    """
    Get research history for the authenticated user.
    
    Optionally filter by project_id.
    """
    user_id, _ = await get_current_user(request)
    
    _, _, supa = await get_research_services()
    
    try:
        research = await supa.get_research_results(
            user_id=user_id,
            project_id=project_id,
            limit=limit,
        )
        return ResearchHistoryResponse(success=True, research=research)
    except Exception as e:
        return ResearchHistoryResponse(success=False, error=str(e))


@app.get("/research/{research_id}", response_model=ResearchResponse)
@limiter.limit("30/minute")
async def get_research_by_id(research_id: str, request: Request):
    """
    Get a specific research result by ID.
    """
    await get_current_user(request)
    
    _, _, supa = await get_research_services()
    
    try:
        research = await supa.get_research_result_by_id(research_id)
        if not research:
            return ResearchResponse(success=False, error="Research not found")
        
        return ResearchResponse(
            success=True,
            provider=research.get("provider"),
            model=research.get("model"),
            content=research.get("content"),
            prompt_context=research.get("prompt_context"),
            citations=research.get("citations"),
            search_results=research.get("search_results"),
            web_searches=research.get("web_searches"),
            usage=research.get("usage"),
            research_id=research_id,
            reused=False,
        )
    except Exception as e:
        return ResearchResponse(success=False, error=str(e))


@app.post("/research/similar", response_model=SimilarResearchResponse)
@limiter.limit("10/minute")
async def search_similar_research(
    similar_request: SimilarResearchRequest,
    request: Request,
):
    """
    Search for similar research results using semantic similarity.
    
    This enables the "Eternal Memory" feature - finding past research
    that matches the current query before conducting new research.
    """
    user_id, _ = await get_current_user(request)
    
    _, rms, _ = await get_research_services()
    
    themes_list = []
    if similar_request.themes:
        themes_list = [t.strip() for t in similar_request.themes.split(",") if t.strip()]
    
    query_text = f"{similar_request.seed_idea} | {similar_request.target_audience} | {','.join(themes_list)} | {similar_request.moral_compass}"
    
    try:
        similar_results = await rms.search_similar_research(
            query_text=query_text,
            user_id=user_id,
            limit=similar_request.limit,
            score_threshold=similar_request.similarity_threshold,
        )
        
        return SimilarResearchResponse(success=True, similar_research=similar_results)
    except Exception as e:
        return SimilarResearchResponse(success=False, error=str(e))


@app.post("/models", response_model=ModelsResponse)
@limiter.limit("30/minute")
async def get_available_models(models_request: ModelsRequest, request: Request):
    """
    Fetch available models from a provider using the user's API key.
    This validates the API key and returns the list of models the user has access to.
    """
    import httpx

    provider = models_request.provider.lower()
    api_key = models_request.api_key

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if provider == "openai":
                # OpenAI Models API
                response = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                if response.status_code != 200:
                    return ModelsResponse(success=False, error=f"OpenAI API error: {response.status_code}")

                data = response.json()
                models = []
                # Filter to chat models only
                chat_model_prefixes = ["gpt-4", "gpt-3.5", "o1", "o3"]
                for model in data.get("data", []):
                    model_id = model.get("id", "")
                    if any(model_id.startswith(prefix) for prefix in chat_model_prefixes):
                        models.append(ModelInfo(
                            id=model_id,
                            name=model_id,
                            context_length=model.get("context_window"),
                        ))
                # Sort by name
                models.sort(key=lambda m: m.id, reverse=True)
                return ModelsResponse(success=True, models=models)

            elif provider == "anthropic":
                # Anthropic doesn't have a models list API, return static list
                # but validate the key first
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-3-5-haiku-20241022",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "hi"}]
                    }
                )
                # Check if key is valid (even error responses indicate valid key format)
                if response.status_code == 401:
                    return ModelsResponse(success=False, error="Invalid Anthropic API key")

                # Return available Claude models
                models = [
                    ModelInfo(id="claude-opus-4.5-20251124", name="Claude Opus 4.5 (S+ Prose)", context_length=200000, description="Best for living prose and roleplay"),
                    ModelInfo(id="claude-sonnet-4-20250514", name="Claude Sonnet 4", context_length=200000),
                    ModelInfo(id="claude-opus-4-20250514", name="Claude Opus 4", context_length=200000),
                    ModelInfo(id="claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet", context_length=200000),
                    ModelInfo(id="claude-3-5-haiku-20241022", name="Claude 3.5 Haiku", context_length=200000),
                ]
                return ModelsResponse(success=True, models=models)

            elif provider == "gemini":
                # Google Gemini Models API
                response = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                )
                if response.status_code != 200:
                    return ModelsResponse(success=False, error=f"Gemini API error: {response.status_code}")

                data = response.json()
                models = []
                for model in data.get("models", []):
                    model_name = model.get("name", "").replace("models/", "")
                    if "gemini" in model_name.lower():
                        models.append(ModelInfo(
                            id=model_name,
                            name=model.get("displayName", model_name),
                            context_length=model.get("inputTokenLimit"),
                            description=model.get("description"),
                        ))
                return ModelsResponse(success=True, models=models)

            elif provider == "openrouter":
                # OpenRouter Models API
                response = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                if response.status_code != 200:
                    return ModelsResponse(success=False, error=f"OpenRouter API error: {response.status_code}")

                data = response.json()
                models = []
                for model in data.get("data", []):
                    models.append(ModelInfo(
                        id=model.get("id", ""),
                        name=model.get("name", model.get("id", "")),
                        context_length=model.get("context_length"),
                        description=model.get("description"),
                    ))
                # Sort by name
                models.sort(key=lambda m: m.name)
                return ModelsResponse(success=True, models=models)

            elif provider == "deepseek":
                # DeepSeek uses OpenAI-compatible API
                response = await client.get(
                    "https://api.deepseek.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                if response.status_code != 200:
                    return ModelsResponse(success=False, error=f"DeepSeek API error: {response.status_code}")

                data = response.json()
                models = []
                for model in data.get("data", []):
                    models.append(ModelInfo(
                        id=model.get("id", ""),
                        name=model.get("id", ""),
                    ))
                return ModelsResponse(success=True, models=models)

            elif provider == "venice":
                # Venice AI Models API
                response = await client.get(
                    "https://api.venice.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                if response.status_code != 200:
                    return ModelsResponse(success=False, error=f"Venice API error: {response.status_code}")

                data = response.json()
                models = []
                for model in data.get("data", []):
                    model_id = model.get("id", "")
                    models.append(ModelInfo(
                        id=model_id,
                        name=model.get("name", model_id),
                        context_length=model.get("context_length"),
                    ))
                return ModelsResponse(success=True, models=models)

            else:
                return ModelsResponse(success=False, error=f"Unknown provider: {provider}")

    except httpx.TimeoutException:
        return ModelsResponse(success=False, error="Request timed out")
    except Exception as e:
        return ModelsResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
