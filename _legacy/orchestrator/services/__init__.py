"""
MANOE Services Module
External service integrations.
"""

from .embedding_providers import (
    EmbeddingProvider,
    EmbeddingProviderInfo,
    EmbeddingProviderType,
    GeminiEmbeddingProvider,
    LocalEmbeddingProvider,
    OpenAIEmbeddingProvider,
    create_embedding_provider,
    get_best_available_provider,
)
from .model_client import ModelResponse, UnifiedModelClient
from .qdrant_memory import QdrantMemoryService
from .redis_queue import RedisQueueService, RedisWorker
from .redis_streams import RedisStreamsService

__all__ = [
    "RedisQueueService",
    "RedisWorker",
    "QdrantMemoryService",
    "UnifiedModelClient",
    "ModelResponse",
    "RedisStreamsService",
    "EmbeddingProvider",
    "EmbeddingProviderInfo",
    "EmbeddingProviderType",
    "OpenAIEmbeddingProvider",
    "GeminiEmbeddingProvider",
    "LocalEmbeddingProvider",
    "create_embedding_provider",
    "get_best_available_provider",
]
