"use strict";
/**
 * Zod Schemas for Supabase Storage
 *
 * Validation schemas for data entering Supabase (System of Record)
 * These schemas validate known fields and strip unknown keys for LLM compatibility.
 * LLMs often return extra fields (role, motivation, backstory, etc.) that don't
 * match DB columns - these are stripped rather than rejected.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseValidationError = exports.SupabaseDraftSchema = exports.SupabaseWorldbuildingSchema = exports.SupabaseCharacterSchema = void 0;
const zod_1 = require("zod");
/**
 * Character schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 * All fields are optional because agents may not provide all data
 */
exports.SupabaseCharacterSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    project_id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).max(500),
    archetype: zod_1.z.string().max(200).optional(),
    core_motivation: zod_1.z.string().max(1000).optional(),
    inner_trap: zod_1.z.string().max(500).optional(),
    psychological_wound: zod_1.z.string().max(1000).optional(),
    coping_mechanism: zod_1.z.string().max(500).optional(),
    deepest_fear: zod_1.z.string().max(500).optional(),
    breaking_point: zod_1.z.string().max(500).optional(),
    occupation_role: zod_1.z.string().max(200).optional(),
    affiliations: zod_1.z.array(zod_1.z.string().max(200)).optional(),
    visual_signature: zod_1.z.string().max(1000).optional(),
    public_goal: zod_1.z.string().max(1000).optional(),
    hidden_goal: zod_1.z.string().max(1000).optional(),
    defining_moment: zod_1.z.string().max(1000).optional(),
    family_background: zod_1.z.string().max(1000).optional(),
    special_skill: zod_1.z.string().max(500).optional(),
    quirks: zod_1.z.array(zod_1.z.string().max(200)).optional(),
    moral_stance: zod_1.z.string().max(500).optional(),
    potential_arc: zod_1.z.string().max(500).optional(),
    qdrant_id: zod_1.z.string().uuid().optional(),
    created_at: zod_1.z.string().datetime().optional(),
});
/**
 * Worldbuilding schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 */
exports.SupabaseWorldbuildingSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    project_id: zod_1.z.string().uuid(),
    element_type: zod_1.z.string().min(1).max(100),
    name: zod_1.z.string().min(1).max(500),
    description: zod_1.z.string().min(1).max(10000),
    attributes: zod_1.z.record(zod_1.z.unknown()).optional(),
    qdrant_id: zod_1.z.string().uuid().optional(),
    created_at: zod_1.z.string().datetime().optional(),
});
/**
 * Draft schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 */
exports.SupabaseDraftSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    project_id: zod_1.z.string().uuid(),
    scene_number: zod_1.z.number().int().positive(),
    title: zod_1.z.string().max(500).optional(),
    setting_description: zod_1.z.string().max(2000).optional(),
    sensory_details: zod_1.z.record(zod_1.z.unknown()).optional(),
    narrative_content: zod_1.z.string().min(1),
    dialogue_entries: zod_1.z.array(zod_1.z.unknown()).optional(),
    subtext_layer: zod_1.z.string().max(2000).optional(),
    emotional_shift: zod_1.z.string().max(500).optional(),
    word_count: zod_1.z.number().int().nonnegative().optional(),
    show_dont_tell_ratio: zod_1.z.number().optional(),
    status: zod_1.z.enum(["draft", "revision", "final"]).default("draft"),
    revision_count: zod_1.z.number().int().nonnegative().default(0),
    qdrant_id: zod_1.z.string().uuid().optional(),
    semantic_check_error: zod_1.z.string().max(5000).optional(),
    contradiction_score: zod_1.z.number().min(0).max(1).optional(),
    created_at: zod_1.z.string().datetime().optional(),
    updated_at: zod_1.z.string().datetime().optional(),
});
/**
 * Validation error class for Supabase operations
 */
class SupabaseValidationError extends Error {
    zodError;
    operation;
    recordType;
    constructor(zodError, operation, recordType) {
        const errorSummary = zodError.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
        super(`Supabase validation failed for ${operation} (${recordType}): ${errorSummary}`);
        this.zodError = zodError;
        this.operation = operation;
        this.recordType = recordType;
        this.name = "SupabaseValidationError";
    }
}
exports.SupabaseValidationError = SupabaseValidationError;
//# sourceMappingURL=SupabaseSchemas.js.map