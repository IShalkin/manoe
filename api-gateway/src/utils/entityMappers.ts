/**
 * Entity Mappers - Convert snake_case DB entities to camelCase API DTOs
 * 
 * These mappers ONLY convert top-level database column names.
 * Nested JSON columns (sensory_details, token_usage, attributes, scenes, etc.)
 * are preserved as-is to maintain data integrity.
 * 
 * This follows the Data Transformation Pattern: convert at API boundary,
 * then work with camelCase consistently in controllers.
 */

import { Character, Draft } from "../services/SupabaseService";

// ============================================================================
// DTO Interfaces (camelCase for API responses)
// ============================================================================

export interface CharacterDTO {
  id: string;
  projectId: string;
  name: string;
  archetype?: string;
  coreMotivation?: string;
  innerTrap?: string;
  psychologicalWound?: string;
  visualSignature?: string;
  qdrantId?: string;
  createdAt: string;
}

export interface DraftDTO {
  id: string;
  projectId: string;
  sceneNumber: number;
  content: string;
  sensoryDetails?: unknown;
  subtextLayer?: string;
  emotionalShift?: string;
  status: string;
  revisionCount: number;
  createdAt: string;
}

export interface OutlineDTO {
  id: string;
  projectId: string;
  structureType: string;
  scenes: unknown[];
  createdAt: string;
}

export interface WorldbuildingDTO {
  id: string;
  projectId: string;
  elementType: string;
  name: string;
  description: string;
  attributes?: unknown;
  qdrantId?: string;
  createdAt: string;
}

export interface CritiqueDTO {
  id: string;
  projectId: string;
  sceneNumber: number;
  overallScore?: number;
  feedback?: string;
  suggestions?: unknown[];
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  projectId: string;
  agentName: string;
  action: string;
  inputSummary?: string;
  outputSummary?: string;
  tokenUsage?: unknown;
  durationMs?: number;
  createdAt: string;
}

// ============================================================================
// Mapping Functions
// ============================================================================

export function mapCharacterToDTO(character: Character): CharacterDTO {
  return {
    id: character.id,
    projectId: character.project_id,
    name: character.name,
    archetype: character.archetype,
    coreMotivation: character.core_motivation,
    innerTrap: character.inner_trap,
    psychologicalWound: character.psychological_wound,
    visualSignature: character.visual_signature,
    qdrantId: character.qdrant_id,
    createdAt: character.created_at,
  };
}

export function mapDraftToDTO(draft: Draft): DraftDTO {
  return {
    id: draft.id,
    projectId: draft.project_id,
    sceneNumber: draft.scene_number,
    content: draft.content,
    sensoryDetails: draft.sensory_details,
    subtextLayer: draft.subtext_layer,
    emotionalShift: draft.emotional_shift,
    status: draft.status,
    revisionCount: draft.revision_count,
    createdAt: draft.created_at,
  };
}

export function mapOutlineToDTO(outline: {
  id: string;
  project_id: string;
  structure_type: string;
  scenes: unknown[];
  created_at: string;
}): OutlineDTO {
  return {
    id: outline.id,
    projectId: outline.project_id,
    structureType: outline.structure_type,
    scenes: outline.scenes,
    createdAt: outline.created_at,
  };
}

export function mapWorldbuildingToDTO(element: {
  id: string;
  project_id: string;
  element_type: string;
  name: string;
  description: string;
  attributes?: unknown;
  qdrant_id?: string;
  created_at: string;
}): WorldbuildingDTO {
  return {
    id: element.id,
    projectId: element.project_id,
    elementType: element.element_type,
    name: element.name,
    description: element.description,
    attributes: element.attributes,
    qdrantId: element.qdrant_id,
    createdAt: element.created_at,
  };
}

export function mapCritiqueToDTO(critique: {
  id: string;
  project_id: string;
  scene_number: number;
  overall_score?: number;
  feedback?: string;
  suggestions?: unknown[];
  created_at: string;
}): CritiqueDTO {
  return {
    id: critique.id,
    projectId: critique.project_id,
    sceneNumber: critique.scene_number,
    overallScore: critique.overall_score,
    feedback: critique.feedback,
    suggestions: critique.suggestions,
    createdAt: critique.created_at,
  };
}

export function mapAuditLogToDTO(log: {
  id: string;
  project_id: string;
  agent_name: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  token_usage?: unknown;
  duration_ms?: number;
  created_at: string;
}): AuditLogDTO {
  return {
    id: log.id,
    projectId: log.project_id,
    agentName: log.agent_name,
    action: log.action,
    inputSummary: log.input_summary,
    outputSummary: log.output_summary,
    tokenUsage: log.token_usage,
    durationMs: log.duration_ms,
    createdAt: log.created_at,
  };
}
