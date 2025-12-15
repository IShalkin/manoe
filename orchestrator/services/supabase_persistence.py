"""
Supabase Persistence Service for MANOE

This service handles persisting generation artifacts (characters, worldbuilding,
outlines, drafts, critiques) to Supabase for long-term storage and retrieval.
"""

import os
from typing import Any, Dict, List, Optional
from datetime import datetime


class SupabasePersistenceService:
    """Service for persisting generation artifacts to Supabase."""

    def __init__(self, supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        """
        Initialize the Supabase persistence service.
        
        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service role key (for server-side operations)
        """
        self.supabase_url = supabase_url or os.getenv("SUPABASE_URL")
        self.supabase_key = supabase_key or os.getenv("SUPABASE_SERVICE_KEY")
        self.client = None
        self._connected = False

    async def connect(self) -> bool:
        """
        Connect to Supabase.
        
        Returns:
            True if connection successful, False otherwise
        """
        if not self.supabase_url or not self.supabase_key:
            return False
            
        try:
            from supabase import create_client, Client
            self.client: Client = create_client(self.supabase_url, self.supabase_key)
            self._connected = True
            return True
        except Exception as e:
            print(f"Failed to connect to Supabase: {e}")
            self._connected = False
            return False

    @property
    def is_connected(self) -> bool:
        """Check if connected to Supabase."""
        return self._connected and self.client is not None

    async def store_characters(self, project_id: str, characters: List[Dict[str, Any]]) -> List[str]:
        """
        Store generated characters in Supabase.
        
        Args:
            project_id: UUID of the project
            characters: List of character dictionaries
            
        Returns:
            List of created character IDs
        """
        if not self.is_connected:
            return []
            
        created_ids = []
        for character in characters:
            try:
                data = {
                    "project_id": project_id,
                    "name": character.get("name", "Unknown"),
                    "archetype": character.get("archetype"),
                    "core_motivation": character.get("core_motivation"),
                    "inner_trap": character.get("inner_trap"),
                    "psychological_wound": character.get("psychological_wound"),
                    "coping_mechanism": character.get("coping_mechanism"),
                    "deepest_fear": character.get("deepest_fear"),
                    "breaking_point": character.get("breaking_point"),
                    "occupation_role": character.get("occupation_role"),
                    "affiliations": character.get("affiliations", []),
                    "visual_signature": character.get("visual_signature"),
                    "public_goal": character.get("public_goal"),
                    "hidden_goal": character.get("hidden_goal"),
                    "defining_moment": character.get("defining_moment"),
                    "family_background": character.get("family_background"),
                    "special_skill": character.get("special_skill"),
                    "quirks": character.get("quirks", []),
                    "moral_stance": character.get("moral_stance"),
                    "potential_arc": character.get("potential_arc"),
                    "qdrant_id": character.get("qdrant_id"),
                }
                
                result = self.client.table("characters").insert(data).execute()
                if result.data:
                    created_ids.append(result.data[0]["id"])
            except Exception as e:
                print(f"Failed to store character {character.get('name')}: {e}")
                
        return created_ids

    async def store_worldbuilding(
        self, project_id: str, elements: List[Dict[str, Any]]
    ) -> List[str]:
        """
        Store worldbuilding elements in Supabase.
        
        Args:
            project_id: UUID of the project
            elements: List of worldbuilding element dictionaries
            
        Returns:
            List of created element IDs
        """
        if not self.is_connected:
            return []
            
        created_ids = []
        for element in elements:
            try:
                data = {
                    "project_id": project_id,
                    "element_type": element.get("element_type", "unknown"),
                    "name": element.get("name", "Unknown"),
                    "description": element.get("description", ""),
                    "attributes": element.get("attributes", {}),
                    "qdrant_id": element.get("qdrant_id"),
                }
                
                result = self.client.table("worldbuilding").insert(data).execute()
                if result.data:
                    created_ids.append(result.data[0]["id"])
            except Exception as e:
                print(f"Failed to store worldbuilding element {element.get('name')}: {e}")
                
        return created_ids

    async def store_outline(
        self, project_id: str, outline: Dict[str, Any]
    ) -> Optional[str]:
        """
        Store plot outline in Supabase.
        
        Args:
            project_id: UUID of the project
            outline: Outline dictionary with structure_type, scenes, etc.
            
        Returns:
            Created outline ID or None
        """
        if not self.is_connected:
            return None
            
        try:
            data = {
                "project_id": project_id,
                "structure_type": outline.get("structure_type", "ThreeAct"),
                "total_scenes": len(outline.get("scenes", [])),
                "target_word_count": outline.get("target_word_count"),
                "scenes": outline.get("scenes", []),
            }
            
            result = self.client.table("outlines").insert(data).execute()
            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Failed to store outline: {e}")
            
        return None

    async def store_draft(
        self, project_id: str, scene_number: int, draft: Dict[str, Any]
    ) -> Optional[str]:
        """
        Store a scene draft in Supabase.
        
        Args:
            project_id: UUID of the project
            scene_number: Scene number (1-indexed)
            draft: Draft dictionary with narrative_content, etc.
            
        Returns:
            Created draft ID or None
        """
        if not self.is_connected:
            return None
            
        try:
            narrative_content = draft.get("narrative_content", "")
            word_count = len(narrative_content.split()) if narrative_content else 0
            
            data = {
                "project_id": project_id,
                "scene_number": scene_number,
                "title": draft.get("title"),
                "setting_description": draft.get("setting_description"),
                "sensory_details": draft.get("sensory_details", {}),
                "narrative_content": narrative_content,
                "dialogue_entries": draft.get("dialogue_entries", []),
                "subtext_layer": draft.get("subtext_layer"),
                "emotional_shift": draft.get("emotional_shift"),
                "word_count": word_count,
                "show_dont_tell_ratio": draft.get("show_dont_tell_ratio"),
                "status": "draft",
                "revision_count": draft.get("revision_count", 0),
                "qdrant_id": draft.get("qdrant_id"),
            }
            
            result = self.client.table("drafts").insert(data).execute()
            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Failed to store draft for scene {scene_number}: {e}")
            
        return None

    async def store_critique(
        self, project_id: str, draft_id: Optional[str], scene_number: int, critique: Dict[str, Any]
    ) -> Optional[str]:
        """
        Store a critique in Supabase.
        
        Args:
            project_id: UUID of the project
            draft_id: UUID of the draft being critiqued (optional)
            scene_number: Scene number (1-indexed)
            critique: Critique dictionary with scores, feedback, etc.
            
        Returns:
            Created critique ID or None
        """
        if not self.is_connected:
            return None
            
        try:
            data = {
                "project_id": project_id,
                "draft_id": draft_id,
                "scene_number": scene_number,
                "overall_score": critique.get("overall_score", 0),
                "approved": critique.get("approved", False),
                "feedback_items": critique.get("feedback_items", []),
                "strengths": critique.get("strengths", []),
                "weaknesses": critique.get("weaknesses", []),
                "revision_required": critique.get("revision_required", True),
                "revision_focus": critique.get("revision_focus", []),
                "creative_risk_assessment": critique.get("creative_risk_assessment"),
                "psychological_alignment": critique.get("psychological_alignment"),
                "complexity_assessment": critique.get("complexity_assessment"),
            }
            
            result = self.client.table("critiques").insert(data).execute()
            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Failed to store critique for scene {scene_number}: {e}")
            
        return None

    async def get_project_characters(self, project_id: str) -> List[Dict[str, Any]]:
        """
        Get all characters for a project.
        
        Args:
            project_id: UUID of the project
            
        Returns:
            List of character dictionaries
        """
        if not self.is_connected:
            return []
            
        try:
            result = self.client.table("characters").select("*").eq("project_id", project_id).execute()
            return result.data or []
        except Exception as e:
            print(f"Failed to get characters: {e}")
            return []

    async def get_project_outline(self, project_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the outline for a project.
        
        Args:
            project_id: UUID of the project
            
        Returns:
            Outline dictionary or None
        """
        if not self.is_connected:
            return None
            
        try:
            result = self.client.table("outlines").select("*").eq("project_id", project_id).single().execute()
            return result.data
        except Exception as e:
            print(f"Failed to get outline: {e}")
            return None

    async def get_project_drafts(self, project_id: str) -> List[Dict[str, Any]]:
        """
        Get all drafts for a project.
        
        Args:
            project_id: UUID of the project
            
        Returns:
            List of draft dictionaries ordered by scene number
        """
        if not self.is_connected:
            return []
            
        try:
            result = (
                self.client.table("drafts")
                .select("*")
                .eq("project_id", project_id)
                .order("scene_number")
                .execute()
            )
            return result.data or []
        except Exception as e:
            print(f"Failed to get drafts: {e}")
            return []

    async def update_project_status(self, project_id: str, status: str, result: Optional[Dict] = None) -> bool:
        """
        Update project status and optionally store result.
        
        Args:
            project_id: UUID of the project
            status: New status (pending, generating, completed, error)
            result: Optional result data to store
            
        Returns:
            True if update successful, False otherwise
        """
        if not self.is_connected:
            return False
            
        try:
            data = {"status": status}
            if result is not None:
                data["result"] = result
                
            self.client.table("projects").update(data).eq("id", project_id).execute()
            return True
        except Exception as e:
            print(f"Failed to update project status: {e}")
            return False

    async def store_generation_event(
        self, project_id: str, event_type: str, agent: Optional[str] = None,
        content: Optional[str] = None, data: Optional[Dict] = None
    ) -> Optional[str]:
        """
        Store a generation event for audit/history.
        
        Args:
            project_id: UUID of the project
            event_type: Type of event (agent_start, agent_complete, etc.)
            agent: Agent name (optional)
            content: Event content (optional)
            data: Additional event data (optional)
            
        Returns:
            Created event ID or None
        """
        if not self.is_connected:
            return None
            
        try:
            event_data = {
                "project_id": project_id,
                "event_type": event_type,
                "agent": agent,
                "content": content,
                "data": data,
            }
            
            result = self.client.table("generation_events").insert(event_data).execute()
            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Failed to store generation event: {e}")
            
        return None

    async def store_run_artifact(
        self, project_id: str, run_id: str, phase: str, artifact_type: str, content: Dict[str, Any]
    ) -> Optional[str]:
        """
        Store a phase artifact for a generation run.
        
        Args:
            project_id: UUID of the project
            run_id: UUID of the generation run
            phase: Phase name (genesis, characters, worldbuilding, outlining, advanced_planning, drafting, polish)
            artifact_type: Type of artifact (narrative_possibility, characters, worldbuilding, outline, etc.)
            content: Artifact content as dictionary
            
        Returns:
            Created artifact ID or None
        """
        if not self.is_connected:
            return None
            
        try:
            data = {
                "project_id": project_id,
                "run_id": run_id,
                "phase": phase,
                "artifact_type": artifact_type,
                "content": content,
            }
            
            result = self.client.table("run_artifacts").upsert(
                data,
                on_conflict="run_id,phase,artifact_type"
            ).execute()
            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            print(f"Failed to store run artifact {artifact_type} for phase {phase}: {e}")
            
        return None

    async def get_run_artifacts(self, run_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Get all artifacts for a generation run.
        
        Args:
            run_id: UUID of the generation run
            
        Returns:
            Dictionary mapping phase to artifact content
        """
        if not self.is_connected:
            return {}
            
        try:
            result = (
                self.client.table("run_artifacts")
                .select("*")
                .eq("run_id", run_id)
                .execute()
            )
            
            artifacts = {}
            for row in result.data or []:
                phase = row.get("phase")
                artifact_type = row.get("artifact_type")
                content = row.get("content")
                if phase and content:
                    if phase not in artifacts:
                        artifacts[phase] = {}
                    artifacts[phase][artifact_type] = content
            return artifacts
        except Exception as e:
            print(f"Failed to get run artifacts: {e}")
            return {}

    async def get_run_artifact(self, run_id: str, phase: str, artifact_type: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific artifact for a generation run.
        
        Args:
            run_id: UUID of the generation run
            phase: Phase name
            artifact_type: Type of artifact
            
        Returns:
            Artifact content or None
        """
        if not self.is_connected:
            return None
            
        try:
            result = (
                self.client.table("run_artifacts")
                .select("content")
                .eq("run_id", run_id)
                .eq("phase", phase)
                .eq("artifact_type", artifact_type)
                .single()
                .execute()
            )
            return result.data.get("content") if result.data else None
        except Exception as e:
            print(f"Failed to get run artifact: {e}")
            return None

    async def delete_run_artifacts_from_phase(self, run_id: str, from_phase: str) -> bool:
        """
        Delete all artifacts from a specific phase onwards for a run.
        This is used when regenerating from a specific phase.
        
        Args:
            run_id: UUID of the generation run
            from_phase: Phase to start deleting from
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_connected:
            return False
        
        phase_order = [
            "genesis", "characters", "worldbuilding", "outlining",
            "advanced_planning", "drafting", "polish"
        ]
        
        try:
            from_index = phase_order.index(from_phase)
            phases_to_delete = phase_order[from_index:]
            
            for phase in phases_to_delete:
                self.client.table("run_artifacts").delete().eq("run_id", run_id).eq("phase", phase).execute()
            
            return True
        except ValueError:
            print(f"Unknown phase: {from_phase}")
            return False
        except Exception as e:
            print(f"Failed to delete run artifacts: {e}")
            return False

    async def get_project_worldbuilding(self, project_id: str) -> List[Dict[str, Any]]:
        """
        Get all worldbuilding elements for a project.
        
        Args:
            project_id: UUID of the project
            
        Returns:
            List of worldbuilding element dictionaries
        """
        if not self.is_connected:
            return []
            
        try:
            result = self.client.table("worldbuilding").select("*").eq("project_id", project_id).execute()
            return result.data or []
        except Exception as e:
            print(f"Failed to get worldbuilding: {e}")
            return []
