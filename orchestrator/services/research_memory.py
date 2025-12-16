"""
Research Memory Service for MANOE
Handles storage and retrieval of research embeddings in Qdrant for "Eternal Memory" feature.
Enables cross-project reuse of expensive research results via semantic similarity search.
"""

from typing import Any, Dict, List, Optional
from uuid import uuid4

from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.models import Distance, VectorParams

from services.embedding_providers import (
    EmbeddingProvider,
    get_best_available_provider,
)


class ResearchMemoryService:
    """Service for managing research vector memory in Qdrant.

    Unlike QdrantMemoryService which is project-scoped, this service supports
    cross-project research reuse via user-scoped similarity search.

    Supports multiple embedding providers with automatic fallback:
    1. OpenAI (if API key provided) - best quality, 1536 dimensions
    2. Gemini (if API key provided) - good quality, 768 dimensions
    3. Local fastembed (no key required) - 384 dimensions
    """

    COLLECTION_BASE = "manoe_research"

    def __init__(
        self,
        url: str = "http://localhost:6333",
        api_key: Optional[str] = None,
    ):
        self.url = url
        self.api_key = api_key
        self._client: Optional[QdrantClient] = None
        self._embedding_provider: Optional[EmbeddingProvider] = None
        self._collection_suffix: str = ""

    @property
    def embedding_provider(self) -> Optional[EmbeddingProvider]:
        """Get the current embedding provider."""
        return self._embedding_provider

    @property
    def vector_size(self) -> int:
        """Get the vector size for the current embedding provider."""
        if self._embedding_provider:
            return self._embedding_provider.dimension
        return 1536

    def _get_collection_name(self) -> str:
        """Get the full collection name with embedding provider suffix."""
        if self._collection_suffix:
            return f"{self.COLLECTION_BASE}__{self._collection_suffix}"
        return self.COLLECTION_BASE

    @property
    def collection_name(self) -> str:
        return self._get_collection_name()

    async def connect(
        self,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        embedding_provider: Optional[EmbeddingProvider] = None,
        prefer_local: bool = False,
    ) -> None:
        """Initialize Qdrant client and embedding provider.

        Args:
            openai_api_key: OpenAI API key for embeddings (highest priority)
            gemini_api_key: Gemini API key for embeddings (second priority)
            embedding_provider: Pre-configured embedding provider (overrides keys)
            prefer_local: If True, use local embeddings even if API keys available
        """
        self._client = QdrantClient(url=self.url, api_key=self.api_key)

        if embedding_provider:
            self._embedding_provider = embedding_provider
        else:
            self._embedding_provider = get_best_available_provider(
                openai_api_key=openai_api_key,
                gemini_api_key=gemini_api_key,
                prefer_local=prefer_local,
            )

        if self._embedding_provider:
            info = self._embedding_provider.info
            self._collection_suffix = f"{info.provider_type.value}_{info.dimension}"

        await self._ensure_collection()

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            raise RuntimeError("Qdrant client not connected. Call connect() first.")
        return self._client

    async def _ensure_collection(self) -> None:
        """Create collection if it doesn't exist."""
        collection = self.collection_name
        existing = {c.name for c in self.client.get_collections().collections}

        if collection not in existing:
            self.client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE,
                ),
            )

    async def _get_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using the configured embedding provider."""
        if self._embedding_provider is None:
            raise RuntimeError(
                "Embedding provider not initialized. "
                "Call connect() with API keys or enable local embeddings."
            )
        return await self._embedding_provider.embed_single(text)

    def _build_query_text(
        self,
        seed_idea: str,
        themes: Optional[List[str]] = None,
        moral_compass: Optional[str] = None,
        target_audience: Optional[str] = None,
    ) -> str:
        """Build normalized query text for embedding.
        
        This creates a consistent text representation for similarity search.
        """
        parts = [f"Story idea: {seed_idea}"]
        
        if themes:
            parts.append(f"Themes: {', '.join(themes)}")
        
        if moral_compass:
            parts.append(f"Moral compass: {moral_compass}")
        
        if target_audience:
            parts.append(f"Target audience: {target_audience}")
        
        return "\n".join(parts)

    async def store_research(
        self,
        research_id: str,
        user_id: str,
        query_text: str,
        seed_idea: str,
        target_audience: Optional[str] = None,
        themes: Optional[List[str]] = None,
        moral_compass: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        created_at: Optional[str] = None,
    ) -> str:
        """Store a research result embedding for similarity search.
        
        Args:
            research_id: UUID of the research result in Supabase (can be "pending" initially)
            user_id: UUID of the user who created the research
            query_text: The full query text to embed (seed_idea + audience + themes + moral)
            seed_idea: The seed idea that was researched
            target_audience: Target audience description
            themes: List of themes
            moral_compass: Moral compass setting
            provider: Research provider (perplexity, openai_deep_research)
            model: Model used for research
            created_at: Timestamp of creation
            
        Returns:
            Qdrant point ID
        """
        embedding = await self._get_embedding(query_text)

        point_id = str(uuid4())

        self.client.upsert(
            collection_name=self.collection_name,
            points=[
                qdrant_models.PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "research_id": research_id,
                        "user_id": user_id,
                        "seed_idea": seed_idea,
                        "target_audience": target_audience,
                        "themes": themes or [],
                        "moral_compass": moral_compass,
                        "provider": provider,
                        "model": model,
                        "created_at": created_at,
                    },
                )
            ],
        )

        return point_id

    async def search_similar_research(
        self,
        query_text: str,
        user_id: Optional[str] = None,
        limit: int = 5,
        score_threshold: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """Search for similar research results by semantic similarity.
        
        Args:
            query_text: The query text to search for (seed_idea + audience + themes + moral)
            user_id: Filter by user ID (optional, for user-scoped search)
            limit: Maximum number of results
            score_threshold: Minimum similarity score (0-1)
            
        Returns:
            List of similar research results with scores and payload
        """
        query_embedding = await self._get_embedding(query_text)

        filter_conditions = []
        if user_id:
            filter_conditions.append(
                qdrant_models.FieldCondition(
                    key="user_id",
                    match=qdrant_models.MatchValue(value=user_id),
                )
            )

        query_filter = None
        if filter_conditions:
            query_filter = qdrant_models.Filter(must=filter_conditions)

        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=query_filter,
            limit=limit,
            score_threshold=score_threshold,
        )

        return [
            {
                "point_id": r.id,
                "score": r.score,
                "payload": {
                    "research_id": r.payload.get("research_id"),
                    "user_id": r.payload.get("user_id"),
                    "seed_idea": r.payload.get("seed_idea"),
                    "target_audience": r.payload.get("target_audience"),
                    "themes": r.payload.get("themes"),
                    "moral_compass": r.payload.get("moral_compass"),
                    "provider": r.payload.get("provider"),
                    "model": r.payload.get("model"),
                    "created_at": r.payload.get("created_at"),
                },
            }
            for r in results
        ]

    async def delete_research(self, point_id: str) -> None:
        """Delete a research embedding by point ID."""
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=qdrant_models.PointIdsList(points=[point_id]),
        )

    async def delete_user_research(self, user_id: str) -> None:
        """Delete all research embeddings for a user."""
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=qdrant_models.FilterSelector(
                filter=qdrant_models.Filter(
                    must=[
                        qdrant_models.FieldCondition(
                            key="user_id",
                            match=qdrant_models.MatchValue(value=user_id),
                        )
                    ]
                )
            ),
        )

    async def update_research_id(self, point_id: str, research_id: str) -> None:
        """Update the research_id in a Qdrant point's payload.
        
        This is called after storing in Supabase to link the Qdrant point
        to the actual research_result_id.
        
        Args:
            point_id: The Qdrant point ID
            research_id: The Supabase research_result ID
        """
        self.client.set_payload(
            collection_name=self.collection_name,
            payload={"research_id": research_id},
            points=[point_id],
        )

    async def initialize(
        self,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
    ) -> None:
        """Initialize the service with default settings.
        
        This is a convenience method that calls connect() with environment
        variables for API keys if not provided.
        
        Args:
            openai_api_key: OpenAI API key (optional, uses env var if not provided)
            gemini_api_key: Gemini API key (optional, uses env var if not provided)
        """
        import os
        
        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.url = qdrant_url
        
        openai_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        gemini_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
        
        await self.connect(
            openai_api_key=openai_key,
            gemini_api_key=gemini_key,
            prefer_local=True,
        )
