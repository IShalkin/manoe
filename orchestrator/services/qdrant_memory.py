"""
Qdrant Vector Memory Service for MANOE
Handles storage and retrieval of character and worldbuilding embeddings.
"""

from typing import Any, Dict, List, Optional
from uuid import uuid4

from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.models import Distance, VectorParams


class QdrantMemoryService:
    """Service for managing vector memory in Qdrant."""
    
    # Collection names
    COLLECTION_CHARACTERS = "manoe_characters"
    COLLECTION_WORLDBUILDING = "manoe_worldbuilding"
    COLLECTION_SCENES = "manoe_scenes"
    
    # Vector dimensions (OpenAI text-embedding-3-small)
    VECTOR_SIZE = 1536
    
    def __init__(
        self,
        url: str = "http://localhost:6333",
        api_key: Optional[str] = None,
    ):
        self.url = url
        self.api_key = api_key
        self._client: Optional[QdrantClient] = None
        self._embedding_client = None
    
    async def connect(self, openai_api_key: Optional[str] = None) -> None:
        """Initialize Qdrant client and create collections if needed."""
        self._client = QdrantClient(url=self.url, api_key=self.api_key)
        
        # Initialize OpenAI for embeddings if key provided
        if openai_api_key:
            from openai import AsyncOpenAI
            self._embedding_client = AsyncOpenAI(api_key=openai_api_key)
        
        # Create collections if they don't exist
        await self._ensure_collections()
    
    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            raise RuntimeError("Qdrant client not connected. Call connect() first.")
        return self._client
    
    async def _ensure_collections(self) -> None:
        """Create collections if they don't exist."""
        collections = [
            self.COLLECTION_CHARACTERS,
            self.COLLECTION_WORLDBUILDING,
            self.COLLECTION_SCENES,
        ]
        
        existing = {c.name for c in self.client.get_collections().collections}
        
        for collection in collections:
            if collection not in existing:
                self.client.create_collection(
                    collection_name=collection,
                    vectors_config=VectorParams(
                        size=self.VECTOR_SIZE,
                        distance=Distance.COSINE,
                    ),
                )
    
    async def _get_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using OpenAI."""
        if self._embedding_client is None:
            raise RuntimeError("Embedding client not initialized. Provide OpenAI API key.")
        
        response = await self._embedding_client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        return response.data[0].embedding
    
    # ========================================================================
    # Character Memory Operations
    # ========================================================================
    
    async def store_character(
        self,
        project_id: str,
        character: Dict[str, Any],
    ) -> str:
        """Store a character profile as a vector."""
        # Create text representation for embedding
        text = self._character_to_text(character)
        embedding = await self._get_embedding(text)
        
        point_id = str(uuid4())
        
        self.client.upsert(
            collection_name=self.COLLECTION_CHARACTERS,
            points=[
                qdrant_models.PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "project_id": project_id,
                        "character_name": character.get("name"),
                        "archetype": character.get("archetype"),
                        "core_motivation": character.get("core_motivation"),
                        "inner_trap": character.get("inner_trap"),
                        "psychological_wound": character.get("psychological_wound"),
                        "visual_signature": character.get("visual_signature"),
                        "full_profile": character,
                    },
                )
            ],
        )
        
        return point_id
    
    async def search_characters(
        self,
        project_id: str,
        query: str,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Search for characters by semantic similarity."""
        query_embedding = await self._get_embedding(query)
        
        results = self.client.search(
            collection_name=self.COLLECTION_CHARACTERS,
            query_vector=query_embedding,
            query_filter=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="project_id",
                        match=qdrant_models.MatchValue(value=project_id),
                    )
                ]
            ),
            limit=limit,
        )
        
        return [
            {
                "id": r.id,
                "score": r.score,
                "character": r.payload.get("full_profile"),
            }
            for r in results
        ]
    
    async def get_project_characters(
        self,
        project_id: str,
    ) -> List[Dict[str, Any]]:
        """Get all characters for a project."""
        results = self.client.scroll(
            collection_name=self.COLLECTION_CHARACTERS,
            scroll_filter=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="project_id",
                        match=qdrant_models.MatchValue(value=project_id),
                    )
                ]
            ),
            limit=100,
        )
        
        return [r.payload.get("full_profile") for r in results[0]]
    
    def _character_to_text(self, character: Dict[str, Any]) -> str:
        """Convert character profile to text for embedding."""
        parts = [
            f"Character: {character.get('name', 'Unknown')}",
            f"Archetype: {character.get('archetype', 'Unknown')}",
            f"Core Motivation: {character.get('core_motivation', '')}",
            f"Inner Trap: {character.get('inner_trap', '')}",
            f"Psychological Wound: {character.get('psychological_wound', '')}",
            f"Deepest Fear: {character.get('deepest_fear', '')}",
            f"Visual Signature: {character.get('visual_signature', '')}",
            f"Potential Arc: {character.get('potential_arc', '')}",
        ]
        return "\n".join(parts)
    
    # ========================================================================
    # Worldbuilding Memory Operations
    # ========================================================================
    
    async def store_worldbuilding(
        self,
        project_id: str,
        element_type: str,  # "geography", "culture", "rule", "history"
        element: Dict[str, Any],
    ) -> str:
        """Store a worldbuilding element as a vector."""
        text = self._worldbuilding_to_text(element_type, element)
        embedding = await self._get_embedding(text)
        
        point_id = str(uuid4())
        
        self.client.upsert(
            collection_name=self.COLLECTION_WORLDBUILDING,
            points=[
                qdrant_models.PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "project_id": project_id,
                        "element_type": element_type,
                        "element_name": element.get("name") or element.get("location_name") or element.get("culture_name") or element.get("rule_name"),
                        "full_element": element,
                    },
                )
            ],
        )
        
        return point_id
    
    async def search_worldbuilding(
        self,
        project_id: str,
        query: str,
        element_type: Optional[str] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Search worldbuilding elements by semantic similarity."""
        query_embedding = await self._get_embedding(query)
        
        filter_conditions = [
            qdrant_models.FieldCondition(
                key="project_id",
                match=qdrant_models.MatchValue(value=project_id),
            )
        ]
        
        if element_type:
            filter_conditions.append(
                qdrant_models.FieldCondition(
                    key="element_type",
                    match=qdrant_models.MatchValue(value=element_type),
                )
            )
        
        results = self.client.search(
            collection_name=self.COLLECTION_WORLDBUILDING,
            query_vector=query_embedding,
            query_filter=qdrant_models.Filter(must=filter_conditions),
            limit=limit,
        )
        
        return [
            {
                "id": r.id,
                "score": r.score,
                "element_type": r.payload.get("element_type"),
                "element": r.payload.get("full_element"),
            }
            for r in results
        ]
    
    def _worldbuilding_to_text(self, element_type: str, element: Dict[str, Any]) -> str:
        """Convert worldbuilding element to text for embedding."""
        if element_type == "geography":
            return f"Location: {element.get('location_name', '')}\n{element.get('description', '')}\nClimate: {element.get('climate', '')}\nFeatures: {', '.join(element.get('notable_features', []))}"
        elif element_type == "culture":
            return f"Culture: {element.get('culture_name', '')}\nValues: {', '.join(element.get('values', []))}\nCustoms: {', '.join(element.get('customs', []))}\nTaboos: {', '.join(element.get('taboos', []))}"
        elif element_type == "rule":
            return f"Rule: {element.get('rule_name', '')}\n{element.get('description', '')}\nConsequences: {element.get('consequences_of_breaking', '')}"
        else:
            return str(element)
    
    # ========================================================================
    # Scene Memory Operations
    # ========================================================================
    
    async def store_scene(
        self,
        project_id: str,
        scene_number: int,
        scene: Dict[str, Any],
    ) -> str:
        """Store a scene draft as a vector."""
        text = self._scene_to_text(scene)
        embedding = await self._get_embedding(text)
        
        point_id = str(uuid4())
        
        self.client.upsert(
            collection_name=self.COLLECTION_SCENES,
            points=[
                qdrant_models.PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "project_id": project_id,
                        "scene_number": scene_number,
                        "title": scene.get("title"),
                        "setting": scene.get("setting_description"),
                        "emotional_shift": scene.get("emotional_shift"),
                        "full_scene": scene,
                    },
                )
            ],
        )
        
        return point_id
    
    async def search_scenes(
        self,
        project_id: str,
        query: str,
        limit: int = 3,
    ) -> List[Dict[str, Any]]:
        """Search scenes by semantic similarity (for continuity)."""
        query_embedding = await self._get_embedding(query)
        
        results = self.client.search(
            collection_name=self.COLLECTION_SCENES,
            query_vector=query_embedding,
            query_filter=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="project_id",
                        match=qdrant_models.MatchValue(value=project_id),
                    )
                ]
            ),
            limit=limit,
        )
        
        return [
            {
                "id": r.id,
                "score": r.score,
                "scene_number": r.payload.get("scene_number"),
                "title": r.payload.get("title"),
                "scene": r.payload.get("full_scene"),
            }
            for r in results
        ]
    
    def _scene_to_text(self, scene: Dict[str, Any]) -> str:
        """Convert scene to text for embedding."""
        return f"Scene: {scene.get('title', '')}\nSetting: {scene.get('setting_description', '')}\nContent: {scene.get('narrative_content', '')[:1000]}"
    
    # ========================================================================
    # Cleanup Operations
    # ========================================================================
    
    async def delete_project_data(self, project_id: str) -> None:
        """Delete all vectors for a project."""
        for collection in [
            self.COLLECTION_CHARACTERS,
            self.COLLECTION_WORLDBUILDING,
            self.COLLECTION_SCENES,
        ]:
            self.client.delete(
                collection_name=collection,
                points_selector=qdrant_models.FilterSelector(
                    filter=qdrant_models.Filter(
                        must=[
                            qdrant_models.FieldCondition(
                                key="project_id",
                                match=qdrant_models.MatchValue(value=project_id),
                            )
                        ]
                    )
                ),
            )
