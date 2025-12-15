"""
Multi-Agent Worker for MANOE
Integrates StorytellerGroupChat with Redis Streams for real-time event publishing.
"""

import asyncio
import json
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple

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
from services.supabase_persistence import SupabasePersistenceService
from services.security import (
    ALLOWED_ORIGINS,
    get_current_user,
    run_ownership,
    check_run_ownership,
    validate_request_size,
    MAX_SEED_IDEA_LENGTH,
    MAX_THEMES_LENGTH,
    MAX_TONE_STYLE_LENGTH,
    MAX_CUSTOM_MORAL_LENGTH,
)

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

        Returns:
            Generation results including all agent messages
        """
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
            # Publish error event
            await self.redis_streams.publish_event(
                run_id,
                "generation_error",
                {
                    "run_id": run_id,
                    "status": "error",
                    "error": str(e),
                }
            )
            return {
                "success": False,
                "run_id": run_id,
                "error": str(e),
            }


# HTTP API for triggering generation
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

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
    generation_mode: str = "demo"  # "demo" for quick preview, "full" for complete pipeline
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


@app.post("/models", response_model=ModelsResponse)
@limiter.limit("30/minute")
async def get_available_models(request: ModelsRequest, http_request: Request):
    """
    Fetch available models from a provider using the user's API key.
    This validates the API key and returns the list of models the user has access to.
    """
    import httpx
    
    provider = request.provider.lower()
    api_key = request.api_key
    
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
