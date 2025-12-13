"""
Multi-Agent Worker for MANOE
Integrates StorytellerGroupChat with Redis Streams for real-time event publishing.
"""

import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from dotenv import load_dotenv

from autogen_orchestrator import StorytellerGroupChat
from config import LLMConfiguration, OpenAIConfig, create_default_config_from_env
from models import StoryProject
from pydantic import SecretStr
from services.redis_streams import RedisStreamsService

load_dotenv()


class MultiAgentWorker:
    """
    Worker that runs multi-agent generation and publishes events to Redis Streams.
    """

    def __init__(self):
        self.config = create_default_config_from_env()
        self.redis_streams: Optional[RedisStreamsService] = None
        self._running = False

    async def initialize(self) -> None:
        """Initialize Redis Streams connection."""
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_streams = RedisStreamsService(redis_url)
        await self.redis_streams.connect()
        print(f"Multi-Agent Worker connected to Redis at {redis_url}")

    async def shutdown(self) -> None:
        """Shutdown the worker."""
        self._running = False
        if self.redis_streams:
            await self.redis_streams.disconnect()

    def _create_event_callback(self, run_id: str):
        """Create an event callback that publishes to Redis Streams."""
        async def callback(event_type: str, data: Dict[str, Any]) -> None:
            if self.redis_streams:
                await self.redis_streams.publish_event(run_id, event_type, data)
        
        # Return a sync wrapper since StorytellerGroupChat expects sync callback
        def sync_callback(event_type: str, data: Dict[str, Any]) -> None:
            asyncio.create_task(callback(event_type, data))
        
        return sync_callback

    async def run_generation(
        self,
        run_id: str,
        project_data: Dict[str, Any],
        api_key: str,
        provider: str = "openai",
    ) -> Dict[str, Any]:
        """
        Run multi-agent generation for a project.
        
        Args:
            run_id: Unique identifier for this generation run
            project_data: Project configuration data
            api_key: User's API key for the LLM provider
            provider: LLM provider to use (default: openai)
            
        Returns:
            Generation results including all agent messages
        """
        # Publish start event
        await self.redis_streams.publish_event(
            run_id,
            "generation_start",
            {
                "run_id": run_id,
                "project": project_data,
                "status": "starting",
            }
        )

        try:
            # Create project from data
            project = StoryProject.model_validate(project_data)
            
            # Create config with user's API key for this request
            request_config = LLMConfiguration(
                openai=OpenAIConfig(api_key=SecretStr(api_key)) if provider == "openai" else None,
            )
            
            # Create group chat with event callback and user's config
            event_callback = self._create_event_callback(run_id)
            group_chat = StorytellerGroupChat(
                config=request_config,
                event_callback=event_callback,
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

            # Run Genesis phase only for now (quick demo)
            # Full generation would use run_full_generation
            result = await group_chat.run_genesis_phase(project)

            # Publish completion event
            await self.redis_streams.publish_event(
                run_id,
                "generation_complete",
                {
                    "run_id": run_id,
                    "status": "completed",
                    "result_summary": str(result.get("narrative_possibility", {}))[:500],
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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="MANOE Multi-Agent Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

worker: Optional[MultiAgentWorker] = None


class GenerateRequest(BaseModel):
    seed_idea: str
    moral_compass: str = "ambiguous"
    target_audience: str = ""
    themes: Optional[str] = None
    provider: str = "openai"
    model: str = "gpt-4o"
    api_key: str


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
async def generate(request: GenerateRequest):
    """Start a multi-agent generation run."""
    if not worker:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    run_id = str(uuid.uuid4())
    
    # Capitalize moral_compass to match enum values (Ethical, Unethical, Amoral, Ambiguous, UserDefined)
    moral_compass_capitalized = request.moral_compass.capitalize() if request.moral_compass else "Ambiguous"
    
    project_data = {
        "seed_idea": request.seed_idea,
        "moral_compass": moral_compass_capitalized,
        "target_audience": request.target_audience,
        "theme_core": request.themes.split(",") if request.themes else [],
    }

    # Start generation in background with user's API key
    asyncio.create_task(worker.run_generation(
        run_id=run_id,
        project_data=project_data,
        api_key=request.api_key,
        provider=request.provider,
    ))

    return GenerateResponse(
        success=True,
        run_id=run_id,
        message="Generation started. Connect to SSE endpoint for real-time updates.",
    )


@app.get("/runs/{run_id}/events")
async def stream_events(run_id: str):
    """Stream events for a generation run via SSE."""
    if not worker or not worker.redis_streams:
        raise HTTPException(status_code=503, detail="Worker not initialized")

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
async def get_messages(run_id: str):
    """Get all agent messages for a run."""
    if not worker or not worker.redis_streams:
        raise HTTPException(status_code=503, detail="Worker not initialized")

    events = await worker.redis_streams.get_events(run_id, start_id="0", count=1000)
    
    # Filter to agent-related events
    agent_messages = []
    for event in events:
        if event.get("type") in ["agent_start", "agent_complete", "agent_message"]:
            agent_messages.append(event)
    
    return {"run_id": run_id, "messages": agent_messages}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
