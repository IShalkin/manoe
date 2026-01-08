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
import { Character, Draft, Outline, Worldbuilding, Critique, AuditLog } from "../services/SupabaseService";
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
    title?: string;
    wordCount?: number;
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
    overallScore: number;
    approved: boolean;
    feedbackItems?: unknown[];
    strengths?: unknown;
    weaknesses?: unknown;
    revisionRequired?: boolean;
    revisionFocus?: unknown;
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
export declare function mapCharacterToDTO(character: Character): CharacterDTO;
export declare function mapDraftToDTO(draft: Draft): DraftDTO;
export declare function mapOutlineToDTO(outline: Outline): OutlineDTO;
export declare function mapWorldbuildingToDTO(element: Worldbuilding): WorldbuildingDTO;
export declare function mapCritiqueToDTO(critique: Critique): CritiqueDTO;
export declare function mapAuditLogToDTO(log: AuditLog): AuditLogDTO;
//# sourceMappingURL=entityMappers.d.ts.map