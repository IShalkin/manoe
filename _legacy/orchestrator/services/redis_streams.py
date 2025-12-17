"""
Redis Streams Service for MANOE
Provides reliable event streaming using Redis Streams for real-time updates.
"""

import asyncio
import json
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional

import redis.asyncio as redis


class RedisStreamsService:
    """
    Service for managing Redis Streams for event publishing and consumption.

    Uses Redis Streams for:
    - Reliable event delivery with consumer groups
    - Real-time event streaming to SSE endpoints
    - Event persistence and replay capability
    """

    # Stream names
    STREAM_EVENTS = "manoe:events:{run_id}"
    STREAM_GLOBAL = "manoe:events:global"

    # Consumer group
    CONSUMER_GROUP = "manoe-consumers"

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._client: Optional[redis.Redis] = None

    async def connect(self) -> None:
        """Establish connection to Redis."""
        self._client = redis.from_url(self.redis_url, decode_responses=True)
        await self._client.ping()

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self._client:
            await self._client.close()

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            raise RuntimeError("Redis client not connected. Call connect() first.")
        return self._client

    def _get_stream_key(self, run_id: str) -> str:
        """Get the stream key for a specific run."""
        return self.STREAM_EVENTS.format(run_id=run_id)

    async def publish_event(
        self,
        run_id: str,
        event_type: str,
        data: Dict[str, Any],
        maxlen: int = 1000,
    ) -> str:
        """
        Publish an event to a run-specific stream.

        Args:
            run_id: Unique identifier for the generation run
            event_type: Type of event (e.g., "phase_start", "agent_complete")
            data: Event data payload
            maxlen: Maximum stream length (older events are trimmed)

        Returns:
            The stream entry ID
        """
        stream_key = self._get_stream_key(run_id)

        event = {
            "type": event_type,
            "run_id": run_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": json.dumps(data),
        }

        # Add to run-specific stream
        entry_id = await self.client.xadd(
            stream_key,
            event,
            maxlen=maxlen,
        )

        # Also add to global stream for monitoring
        await self.client.xadd(
            self.STREAM_GLOBAL,
            event,
            maxlen=maxlen * 10,  # Keep more events in global stream
        )

        return entry_id

    async def get_events(
        self,
        run_id: str,
        start_id: str = "0",
        count: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Get events from a run-specific stream.

        Args:
            run_id: Unique identifier for the generation run
            start_id: Start reading from this ID (exclusive)
            count: Maximum number of events to return

        Returns:
            List of events with their IDs
        """
        stream_key = self._get_stream_key(run_id)

        try:
            entries = await self.client.xrange(
                stream_key,
                min=f"({start_id}" if start_id != "0" else "-",
                max="+",
                count=count,
            )
        except redis.ResponseError:
            return []

        events = []
        for entry_id, fields in entries:
            event = {
                "id": entry_id,
                "type": fields.get("type"),
                "run_id": fields.get("run_id"),
                "timestamp": fields.get("timestamp"),
                "data": json.loads(fields.get("data", "{}")),
            }
            events.append(event)

        return events

    async def stream_events(
        self,
        run_id: str,
        start_id: str = "$",
        block_ms: int = 5000,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream events from a run-specific stream (blocking).

        Args:
            run_id: Unique identifier for the generation run
            start_id: Start reading from this ID ("$" for new events only)
            block_ms: Block timeout in milliseconds

        Yields:
            Events as they arrive
        """
        stream_key = self._get_stream_key(run_id)
        last_id = start_id

        while True:
            try:
                entries = await self.client.xread(
                    {stream_key: last_id},
                    block=block_ms,
                    count=10,
                )

                if entries:
                    for stream_name, stream_entries in entries:
                        for entry_id, fields in stream_entries:
                            last_id = entry_id
                            event = {
                                "id": entry_id,
                                "type": fields.get("type"),
                                "run_id": fields.get("run_id"),
                                "timestamp": fields.get("timestamp"),
                                "data": json.loads(fields.get("data", "{}")),
                            }
                            yield event
                else:
                    # No new events, yield heartbeat
                    yield {
                        "id": "heartbeat",
                        "type": "heartbeat",
                        "run_id": run_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "data": {},
                    }

            except asyncio.CancelledError:
                break
            except Exception as e:
                # Log error and continue
                yield {
                    "id": "error",
                    "type": "error",
                    "run_id": run_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"error": str(e)},
                }
                await asyncio.sleep(1)

    async def create_consumer_group(
        self,
        run_id: str,
        group_name: str = None,
    ) -> bool:
        """
        Create a consumer group for a stream.

        Args:
            run_id: Unique identifier for the generation run
            group_name: Consumer group name (defaults to CONSUMER_GROUP)

        Returns:
            True if created, False if already exists
        """
        stream_key = self._get_stream_key(run_id)
        group = group_name or self.CONSUMER_GROUP

        try:
            await self.client.xgroup_create(
                stream_key,
                group,
                id="0",
                mkstream=True,
            )
            return True
        except redis.ResponseError as e:
            if "BUSYGROUP" in str(e):
                return False
            raise

    async def consume_events(
        self,
        run_id: str,
        consumer_name: str,
        group_name: str = None,
        count: int = 10,
        block_ms: int = 5000,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Consume events from a stream using consumer groups.

        Args:
            run_id: Unique identifier for the generation run
            consumer_name: Unique name for this consumer
            group_name: Consumer group name
            count: Maximum events per read
            block_ms: Block timeout in milliseconds

        Yields:
            Events for processing
        """
        stream_key = self._get_stream_key(run_id)
        group = group_name or self.CONSUMER_GROUP

        # Ensure consumer group exists
        await self.create_consumer_group(run_id, group)

        while True:
            try:
                entries = await self.client.xreadgroup(
                    group,
                    consumer_name,
                    {stream_key: ">"},
                    count=count,
                    block=block_ms,
                )

                if entries:
                    for stream_name, stream_entries in entries:
                        for entry_id, fields in stream_entries:
                            event = {
                                "id": entry_id,
                                "type": fields.get("type"),
                                "run_id": fields.get("run_id"),
                                "timestamp": fields.get("timestamp"),
                                "data": json.loads(fields.get("data", "{}")),
                            }
                            yield event

                            # Acknowledge the event
                            await self.client.xack(stream_key, group, entry_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                yield {
                    "id": "error",
                    "type": "error",
                    "run_id": run_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"error": str(e)},
                }
                await asyncio.sleep(1)

    async def get_stream_info(self, run_id: str) -> Dict[str, Any]:
        """
        Get information about a stream.

        Args:
            run_id: Unique identifier for the generation run

        Returns:
            Stream information including length, groups, etc.
        """
        stream_key = self._get_stream_key(run_id)

        try:
            info = await self.client.xinfo_stream(stream_key)
            return {
                "length": info.get("length", 0),
                "first_entry": info.get("first-entry"),
                "last_entry": info.get("last-entry"),
                "groups": info.get("groups", 0),
            }
        except redis.ResponseError:
            return {"length": 0, "exists": False}

    async def delete_stream(self, run_id: str) -> bool:
        """
        Delete a stream and all its data.

        Args:
            run_id: Unique identifier for the generation run

        Returns:
            True if deleted
        """
        stream_key = self._get_stream_key(run_id)
        result = await self.client.delete(stream_key)
        return result > 0

    async def trim_stream(self, run_id: str, maxlen: int = 1000) -> int:
        """
        Trim a stream to a maximum length.

        Args:
            run_id: Unique identifier for the generation run
            maxlen: Maximum number of entries to keep

        Returns:
            Number of entries removed
        """
        stream_key = self._get_stream_key(run_id)
        return await self.client.xtrim(stream_key, maxlen=maxlen)
