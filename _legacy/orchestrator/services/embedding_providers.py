"""
Embedding Provider Abstraction for MANOE
Supports multiple embedding backends: OpenAI, Gemini, and local (fastembed).
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class EmbeddingProviderType(str, Enum):
    """Supported embedding providers."""
    OPENAI = "openai"
    GEMINI = "gemini"
    LOCAL = "local"


class EmbeddingProviderInfo(BaseModel):
    """Metadata about an embedding provider."""
    provider_type: EmbeddingProviderType
    model_name: str
    dimension: int


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @property
    @abstractmethod
    def info(self) -> EmbeddingProviderInfo:
        """Get provider metadata including dimension."""
        pass

    @property
    def dimension(self) -> int:
        """Get the embedding dimension."""
        return self.info.dimension

    @property
    def provider_id(self) -> str:
        """Get a unique identifier for this provider configuration."""
        info = self.info
        return f"{info.provider_type.value}__{info.model_name}__{info.dimension}"

    @abstractmethod
    async def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        pass

    async def embed_single(self, text: str) -> List[float]:
        """Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        embeddings = await self.embed([text])
        return embeddings[0]


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider using text-embedding-3-small."""

    MODEL_NAME = "text-embedding-3-small"
    DIMENSION = 1536

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._client = None

    @property
    def info(self) -> EmbeddingProviderInfo:
        return EmbeddingProviderInfo(
            provider_type=EmbeddingProviderType.OPENAI,
            model_name=self.MODEL_NAME,
            dimension=self.DIMENSION,
        )

    async def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self._api_key)
        return self._client

    async def embed(self, texts: List[str]) -> List[List[float]]:
        client = await self._get_client()
        response = await client.embeddings.create(
            model=self.MODEL_NAME,
            input=texts,
        )
        return [item.embedding for item in response.data]


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Google Gemini embedding provider."""

    MODEL_NAME = "models/text-embedding-004"
    DIMENSION = 768

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._configured = False

    @property
    def info(self) -> EmbeddingProviderInfo:
        return EmbeddingProviderInfo(
            provider_type=EmbeddingProviderType.GEMINI,
            model_name=self.MODEL_NAME,
            dimension=self.DIMENSION,
        )

    def _configure(self):
        if not self._configured:
            import google.generativeai as genai
            genai.configure(api_key=self._api_key)
            self._configured = True

    async def embed(self, texts: List[str]) -> List[List[float]]:
        self._configure()
        import google.generativeai as genai

        embeddings = []
        for text in texts:
            result = genai.embed_content(
                model=self.MODEL_NAME,
                content=text,
                task_type="retrieval_document",
            )
            embeddings.append(result["embedding"])
        return embeddings


class LocalEmbeddingProvider(EmbeddingProvider):
    """Local embedding provider using fastembed (no API key required).

    Uses the BAAI/bge-small-en-v1.5 model which is lightweight and fast.
    Falls back to a simple hash-based embedding if fastembed is not available.
    """

    MODEL_NAME = "BAAI/bge-small-en-v1.5"
    DIMENSION = 384
    _USE_FASTEMBED = True

    def __init__(self):
        self._model = None
        self._fastembed_available = None

    @property
    def info(self) -> EmbeddingProviderInfo:
        return EmbeddingProviderInfo(
            provider_type=EmbeddingProviderType.LOCAL,
            model_name=self.MODEL_NAME if self._check_fastembed() else "hash-fallback",
            dimension=self.DIMENSION,
        )

    def _check_fastembed(self) -> bool:
        """Check if fastembed is available."""
        if self._fastembed_available is None:
            try:
                from fastembed import TextEmbedding
                self._fastembed_available = True
            except ImportError:
                self._fastembed_available = False
        return self._fastembed_available

    def _get_model(self):
        """Get or create the fastembed model."""
        if self._model is None and self._check_fastembed():
            from fastembed import TextEmbedding
            self._model = TextEmbedding(model_name=self.MODEL_NAME)
        return self._model

    def _hash_embedding(self, text: str) -> List[float]:
        """Generate a simple hash-based embedding as fallback.

        This is NOT semantically meaningful but allows the system to function
        without external dependencies. Quality will be significantly lower.
        """
        import hashlib

        hash_bytes = hashlib.sha384(text.encode()).digest()
        embedding = []
        for i in range(0, len(hash_bytes), 4):
            chunk = hash_bytes[i:i+4]
            value = int.from_bytes(chunk, byteorder='big', signed=False)
            normalized = (value / (2**32)) * 2 - 1
            embedding.append(normalized)

        while len(embedding) < self.DIMENSION:
            embedding.append(0.0)

        return embedding[:self.DIMENSION]

    async def embed(self, texts: List[str]) -> List[List[float]]:
        model = self._get_model()

        if model is not None:
            embeddings_generator = model.embed(texts)
            return [list(emb) for emb in embeddings_generator]
        else:
            return [self._hash_embedding(text) for text in texts]


def create_embedding_provider(
    provider_type: EmbeddingProviderType,
    api_key: Optional[str] = None,
) -> EmbeddingProvider:
    """Factory function to create an embedding provider.

    Args:
        provider_type: Type of embedding provider to create
        api_key: API key for cloud providers (not needed for local)

    Returns:
        Configured embedding provider instance

    Raises:
        ValueError: If API key is required but not provided
    """
    if provider_type == EmbeddingProviderType.OPENAI:
        if not api_key:
            raise ValueError("OpenAI embedding provider requires an API key")
        return OpenAIEmbeddingProvider(api_key)

    elif provider_type == EmbeddingProviderType.GEMINI:
        if not api_key:
            raise ValueError("Gemini embedding provider requires an API key")
        return GeminiEmbeddingProvider(api_key)

    elif provider_type == EmbeddingProviderType.LOCAL:
        return LocalEmbeddingProvider()

    else:
        raise ValueError(f"Unsupported embedding provider type: {provider_type}")


def get_best_available_provider(
    openai_api_key: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
    prefer_local: bool = False,
) -> Optional[EmbeddingProvider]:
    """Get the best available embedding provider based on available keys.

    Priority order (unless prefer_local is True):
    1. OpenAI (if key available) - best quality
    2. Gemini (if key available) - good quality
    3. Local (fastembed) - no key required, lower quality

    Args:
        openai_api_key: OpenAI API key
        gemini_api_key: Gemini API key
        prefer_local: If True, prefer local embeddings even if API keys available

    Returns:
        Best available embedding provider, or None if none available
    """
    if prefer_local:
        return LocalEmbeddingProvider()

    if openai_api_key:
        return OpenAIEmbeddingProvider(openai_api_key)

    if gemini_api_key:
        return GeminiEmbeddingProvider(gemini_api_key)

    return LocalEmbeddingProvider()
