"""
MANOE Orchestrator - Main Entry Point
Multi-Agent Narrative Orchestration Engine
"""

import asyncio
import os
import signal
from typing import Any, Dict

from dotenv import load_dotenv

from config import LLMConfiguration, LLMProvider, create_default_config_from_env
from agents import (
    ArchitectAgent,
    ProfilerAgent,
    StrategistAgent,
    WriterAgent,
    CriticAgent,
    create_llm_client,
)
from services import RedisQueueService, RedisWorker, QdrantMemoryService
from models import JobPayload, ProjectStatus


# Load environment variables
load_dotenv()


class NarrativeOrchestrator:
    """Main orchestrator for narrative generation pipeline."""
    
    def __init__(self, config: LLMConfiguration):
        self.config = config
        self.redis_service: RedisQueueService = None
        self.qdrant_service: QdrantMemoryService = None
        self.agents: Dict[str, Any] = {}
        self._running = False
    
    async def initialize(self) -> None:
        """Initialize all services and agents."""
        # Initialize Redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_service = RedisQueueService(redis_url)
        await self.redis_service.connect()
        print(f"Connected to Redis at {redis_url}")
        
        # Initialize Qdrant
        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        qdrant_api_key = os.getenv("QDRANT_API_KEY")
        self.qdrant_service = QdrantMemoryService(qdrant_url, qdrant_api_key)
        
        # Get OpenAI key for embeddings
        openai_key = None
        if self.config.openai:
            openai_key = self.config.openai.api_key.get_secret_value()
        await self.qdrant_service.connect(openai_key)
        print(f"Connected to Qdrant at {qdrant_url}")
        
        # Initialize agents
        await self._initialize_agents()
        print("All agents initialized")
    
    async def _initialize_agents(self) -> None:
        """Initialize all narrative agents with their configured LLM clients."""
        agent_configs = self.config.agent_models
        
        # Architect Agent
        architect_client = create_llm_client(
            agent_configs.architect_provider,
            self.config,
            agent_configs.architect_model,
        )
        self.agents["architect"] = ArchitectAgent(architect_client)
        
        # Profiler Agent
        profiler_client = create_llm_client(
            agent_configs.profiler_provider,
            self.config,
            agent_configs.profiler_model,
        )
        self.agents["profiler"] = ProfilerAgent(profiler_client)
        
        # Strategist Agent
        strategist_client = create_llm_client(
            agent_configs.strategist_provider,
            self.config,
            agent_configs.strategist_model,
        )
        self.agents["strategist"] = StrategistAgent(strategist_client)
        
        # Writer Agent
        writer_client = create_llm_client(
            agent_configs.writer_provider,
            self.config,
            agent_configs.writer_model,
        )
        self.agents["writer"] = WriterAgent(writer_client)
        
        # Critic Agent
        critic_client = create_llm_client(
            agent_configs.critic_provider,
            self.config,
            agent_configs.critic_model,
        )
        self.agents["critic"] = CriticAgent(critic_client)
    
    async def process_job(self, job: JobPayload) -> Dict[str, Any]:
        """Process a job based on its phase."""
        print(f"Processing job {job.job_id} - Phase: {job.phase.value}")
        
        if job.phase == ProjectStatus.GENESIS:
            return await self._process_genesis(job)
        elif job.phase == ProjectStatus.CHARACTERS:
            return await self._process_characters(job)
        elif job.phase == ProjectStatus.OUTLINING:
            return await self._process_outlining(job)
        elif job.phase == ProjectStatus.DRAFTING:
            return await self._process_drafting(job)
        elif job.phase == ProjectStatus.CRITIQUE:
            return await self._process_critique(job)
        else:
            raise ValueError(f"Unknown phase: {job.phase}")
    
    async def _process_genesis(self, job: JobPayload) -> Dict[str, Any]:
        """Process Genesis phase - Architect Agent."""
        architect = self.agents["architect"]
        result = await architect.process({
            **job.input_data,
            "project_id": job.project_id,
        })
        return result
    
    async def _process_characters(self, job: JobPayload) -> Dict[str, Any]:
        """Process Characters phase - Profiler Agent."""
        profiler = self.agents["profiler"]
        result = await profiler.process({
            **job.input_data,
            "project_id": job.project_id,
        })
        
        # Store characters in Qdrant
        for character in result.get("characters", []):
            await self.qdrant_service.store_character(
                job.project_id,
                character,
            )
        
        return result
    
    async def _process_outlining(self, job: JobPayload) -> Dict[str, Any]:
        """Process Outlining phase - Strategist Agent."""
        strategist = self.agents["strategist"]
        result = await strategist.process({
            **job.input_data,
            "project_id": job.project_id,
        })
        return result
    
    async def _process_drafting(self, job: JobPayload) -> Dict[str, Any]:
        """Process Drafting phase - Writer Agent."""
        writer = self.agents["writer"]
        
        # Get relevant characters from Qdrant
        scene = job.input_data.get("scene", {})
        characters_present = scene.get("characters_present", [])
        
        characters = []
        for char_name in characters_present:
            results = await self.qdrant_service.search_characters(
                job.project_id,
                char_name,
                limit=1,
            )
            if results:
                characters.append(results[0]["character"])
        
        # Get worldbuilding context
        setting = scene.get("setting", "")
        worldbuilding = await self.qdrant_service.search_worldbuilding(
            job.project_id,
            setting,
            limit=3,
        )
        
        result = await writer.process({
            **job.input_data,
            "project_id": job.project_id,
            "characters": characters,
            "worldbuilding": [w["element"] for w in worldbuilding],
        })
        
        # Store scene in Qdrant
        draft = result.get("draft", {})
        await self.qdrant_service.store_scene(
            job.project_id,
            draft.get("scene_number", 0),
            draft,
        )
        
        return result
    
    async def _process_critique(self, job: JobPayload) -> Dict[str, Any]:
        """Process Critique phase - Critic Agent."""
        critic = self.agents["critic"]
        
        # Get characters for consistency check
        characters = await self.qdrant_service.get_project_characters(job.project_id)
        
        result = await critic.process({
            **job.input_data,
            "project_id": job.project_id,
            "characters": characters,
        })
        
        return result
    
    async def run(self) -> None:
        """Run the orchestrator worker."""
        self._running = True
        
        print("Starting MANOE Orchestrator...")
        print(f"Enabled providers: {[p.value for p in self.config.get_enabled_providers()]}")
        
        worker = RedisWorker(
            self.redis_service,
            self.process_job,
        )
        
        await worker.start()
    
    async def shutdown(self) -> None:
        """Gracefully shutdown the orchestrator."""
        print("Shutting down orchestrator...")
        self._running = False
        
        if self.redis_service:
            await self.redis_service.disconnect()


async def main():
    """Main entry point."""
    # Create configuration from environment
    config = create_default_config_from_env()
    
    # Validate configuration
    errors = config.validate_agent_models()
    if errors:
        print("Configuration errors:")
        for error in errors:
            print(f"  - {error}")
        return
    
    # Create and run orchestrator
    orchestrator = NarrativeOrchestrator(config)
    
    # Handle shutdown signals
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(
            sig,
            lambda: asyncio.create_task(orchestrator.shutdown()),
        )
    
    try:
        await orchestrator.initialize()
        await orchestrator.run()
    except KeyboardInterrupt:
        await orchestrator.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
