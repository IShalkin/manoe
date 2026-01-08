"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCharacterToDTO = mapCharacterToDTO;
exports.mapDraftToDTO = mapDraftToDTO;
exports.mapOutlineToDTO = mapOutlineToDTO;
exports.mapWorldbuildingToDTO = mapWorldbuildingToDTO;
exports.mapCritiqueToDTO = mapCritiqueToDTO;
exports.mapAuditLogToDTO = mapAuditLogToDTO;
// ============================================================================
// Mapping Functions
// ============================================================================
function mapCharacterToDTO(character) {
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
function mapDraftToDTO(draft) {
    return {
        id: draft.id,
        projectId: draft.project_id,
        sceneNumber: draft.scene_number,
        content: draft.narrative_content,
        title: draft.title,
        wordCount: draft.word_count,
        sensoryDetails: draft.sensory_details,
        subtextLayer: draft.subtext_layer,
        emotionalShift: draft.emotional_shift,
        status: draft.status,
        revisionCount: draft.revision_count,
        createdAt: draft.created_at,
    };
}
function mapOutlineToDTO(outline) {
    return {
        id: outline.id,
        projectId: outline.project_id,
        structureType: outline.structure_type,
        scenes: outline.scenes,
        createdAt: outline.created_at,
    };
}
function mapWorldbuildingToDTO(element) {
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
function mapCritiqueToDTO(critique) {
    return {
        id: critique.id,
        projectId: critique.project_id,
        sceneNumber: critique.scene_number,
        overallScore: critique.overall_score,
        approved: critique.approved,
        feedbackItems: critique.feedback_items,
        strengths: critique.strengths,
        weaknesses: critique.weaknesses,
        revisionRequired: critique.revision_required,
        revisionFocus: critique.revision_focus,
        createdAt: critique.created_at,
    };
}
function mapAuditLogToDTO(log) {
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
//# sourceMappingURL=entityMappers.js.map