"""
Redis Queue Service for MANOE
Handles job queue management and pub/sub for agent communication.
"""

import asyncio
import json
from datetime import datetime
from typing import Any, Callable, Dict, Optional

import redis.asyncio as redis

from ..models import JobPayload


class RedisQueueService:
    """Service for managing Redis job queues and pub/sub."""

    # Queue names
    QUEUE_PENDING = "manoe:jobs:pending"
    QUEUE_PROCESSING = "manoe:jobs:processing"
    QUEUE_COMPLETED = "manoe:jobs:completed"
    QUEUE_FAILED = "manoe:jobs:failed"

    # Pub/Sub channels
    CHANNEL_PROJECT = "manoe:events:project"
    CHANNEL_GENERATION = "manoe:events:generation"
    CHANNEL_AGENT = "manoe:events:agent"

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._client: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None

    async def connect(self) -> None:
        """Establish connection to Redis."""
        self._client = redis.from_url(self.redis_url, decode_responses=True)
        await self._client.ping()

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self._pubsub:
            await self._pubsub.close()
        if self._client:
            await self._client.close()

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            raise RuntimeError("Redis client not connected. Call connect() first.")
        return self._client

    # ========================================================================
    # Job Queue Operations
    # ========================================================================

    async def enqueue_job(self, job: JobPayload) -> str:
        """Add a job to the pending queue."""
        job_data = job.model_dump_json()
        await self.client.lpush(self.QUEUE_PENDING, job_data)

        # Publish event
        await self.publish_event(
            self.CHANNEL_PROJECT,
            {
                "type": "job_enqueued",
                "job_id": job.job_id,
                "project_id": job.project_id,
                "phase": job.phase.value,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

        return job.job_id

    async def dequeue_job(self, timeout: int = 0) -> Optional[JobPayload]:
        """Get a job from the pending queue (blocking)."""
        result = await self.client.brpoplpush(
            self.QUEUE_PENDING,
            self.QUEUE_PROCESSING,
            timeout=timeout,
        )

        if result:
            return JobPayload.model_validate_json(result)
        return None

    async def complete_job(self, job_id: str, result: Dict[str, Any]) -> None:
        """Mark a job as completed and store result."""
        # Remove from processing queue
        await self._remove_job_from_queue(self.QUEUE_PROCESSING, job_id)

        # Store result with TTL (24 hours)
        result_key = f"manoe:results:{job_id}"
        await self.client.setex(result_key, 86400, json.dumps(result))

        # Add to completed queue
        completion_data = {
            "job_id": job_id,
            "completed_at": datetime.utcnow().isoformat(),
            "result_key": result_key,
        }
        await self.client.lpush(self.QUEUE_COMPLETED, json.dumps(completion_data))

        # Publish event
        await self.publish_event(
            self.CHANNEL_GENERATION,
            {
                "type": "job_completed",
                "job_id": job_id,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    async def fail_job(self, job_id: str, error: str, retry: bool = True) -> None:
        """Mark a job as failed."""
        # Get job from processing queue
        job_data = await self._get_job_from_queue(self.QUEUE_PROCESSING, job_id)

        if job_data:
            job = JobPayload.model_validate_json(job_data)

            # Remove from processing
            await self._remove_job_from_queue(self.QUEUE_PROCESSING, job_id)

            if retry and job.retry_count < job.max_retries:
                # Increment retry count and re-enqueue
                job.retry_count += 1
                await self.client.lpush(self.QUEUE_PENDING, job.model_dump_json())

                await self.publish_event(
                    self.CHANNEL_GENERATION,
                    {
                        "type": "job_retry",
                        "job_id": job_id,
                        "retry_count": job.retry_count,
                        "error": error,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )
            else:
                # Move to failed queue
                failure_data = {
                    "job_id": job_id,
                    "error": error,
                    "failed_at": datetime.utcnow().isoformat(),
                    "retry_count": job.retry_count,
                }
                await self.client.lpush(self.QUEUE_FAILED, json.dumps(failure_data))

                await self.publish_event(
                    self.CHANNEL_GENERATION,
                    {
                        "type": "job_failed",
                        "job_id": job_id,
                        "error": error,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                )

    async def get_job_result(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get the result of a completed job."""
        result_key = f"manoe:results:{job_id}"
        result = await self.client.get(result_key)
        if result:
            return json.loads(result)
        return None

    async def get_queue_stats(self) -> Dict[str, int]:
        """Get current queue statistics."""
        return {
            "pending": await self.client.llen(self.QUEUE_PENDING),
            "processing": await self.client.llen(self.QUEUE_PROCESSING),
            "completed": await self.client.llen(self.QUEUE_COMPLETED),
            "failed": await self.client.llen(self.QUEUE_FAILED),
        }

    # ========================================================================
    # Pub/Sub Operations
    # ========================================================================

    async def publish_event(self, channel: str, event: Dict[str, Any]) -> None:
        """Publish an event to a channel."""
        await self.client.publish(channel, json.dumps(event))

    async def subscribe(
        self,
        channels: list[str],
        callback: Callable[[str, Dict[str, Any]], None],
    ) -> None:
        """Subscribe to channels and process messages."""
        self._pubsub = self.client.pubsub()
        await self._pubsub.subscribe(*channels)

        async for message in self._pubsub.listen():
            if message["type"] == "message":
                channel = message["channel"]
                data = json.loads(message["data"])
                await callback(channel, data)

    # ========================================================================
    # Helper Methods
    # ========================================================================

    async def _remove_job_from_queue(self, queue: str, job_id: str) -> None:
        """Remove a specific job from a queue."""
        # Get all items in queue
        items = await self.client.lrange(queue, 0, -1)
        for item in items:
            try:
                job = JobPayload.model_validate_json(item)
                if job.job_id == job_id:
                    await self.client.lrem(queue, 1, item)
                    break
            except Exception:
                continue

    async def _get_job_from_queue(self, queue: str, job_id: str) -> Optional[str]:
        """Get a specific job from a queue without removing it."""
        items = await self.client.lrange(queue, 0, -1)
        for item in items:
            try:
                job = JobPayload.model_validate_json(item)
                if job.job_id == job_id:
                    return item
            except Exception:
                continue
        return None


class RedisWorker:
    """Worker that processes jobs from the Redis queue."""

    def __init__(
        self,
        queue_service: RedisQueueService,
        job_handler: Callable[[JobPayload], Dict[str, Any]],
    ):
        self.queue_service = queue_service
        self.job_handler = job_handler
        self._running = False

    async def start(self) -> None:
        """Start processing jobs."""
        self._running = True

        while self._running:
            try:
                job = await self.queue_service.dequeue_job(timeout=5)

                if job:
                    try:
                        result = await self.job_handler(job)
                        await self.queue_service.complete_job(job.job_id, result)
                    except Exception as e:
                        await self.queue_service.fail_job(job.job_id, str(e))

            except asyncio.CancelledError:
                break
            except Exception as e:
                # Log error but continue processing
                print(f"Worker error: {e}")
                await asyncio.sleep(1)

    def stop(self) -> None:
        """Stop processing jobs."""
        self._running = False
