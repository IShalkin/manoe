/**
 * Zod Schemas for Supabase Storage
 *
 * Validation schemas for data entering Supabase (System of Record)
 * These schemas validate known fields and strip unknown keys for LLM compatibility.
 * LLMs often return extra fields (role, motivation, backstory, etc.) that don't
 * match DB columns - these are stripped rather than rejected.
 */
import { z } from "zod";
/**
 * Character schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 * All fields are optional because agents may not provide all data
 */
export declare const SupabaseCharacterSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    project_id: z.ZodString;
    name: z.ZodString;
    archetype: z.ZodOptional<z.ZodString>;
    core_motivation: z.ZodOptional<z.ZodString>;
    inner_trap: z.ZodOptional<z.ZodString>;
    psychological_wound: z.ZodOptional<z.ZodString>;
    coping_mechanism: z.ZodOptional<z.ZodString>;
    deepest_fear: z.ZodOptional<z.ZodString>;
    breaking_point: z.ZodOptional<z.ZodString>;
    occupation_role: z.ZodOptional<z.ZodString>;
    affiliations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    visual_signature: z.ZodOptional<z.ZodString>;
    public_goal: z.ZodOptional<z.ZodString>;
    hidden_goal: z.ZodOptional<z.ZodString>;
    defining_moment: z.ZodOptional<z.ZodString>;
    family_background: z.ZodOptional<z.ZodString>;
    special_skill: z.ZodOptional<z.ZodString>;
    quirks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    moral_stance: z.ZodOptional<z.ZodString>;
    potential_arc: z.ZodOptional<z.ZodString>;
    qdrant_id: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    project_id: string;
    id?: string | undefined;
    archetype?: string | undefined;
    core_motivation?: string | undefined;
    inner_trap?: string | undefined;
    psychological_wound?: string | undefined;
    coping_mechanism?: string | undefined;
    deepest_fear?: string | undefined;
    breaking_point?: string | undefined;
    occupation_role?: string | undefined;
    affiliations?: string[] | undefined;
    visual_signature?: string | undefined;
    public_goal?: string | undefined;
    hidden_goal?: string | undefined;
    defining_moment?: string | undefined;
    family_background?: string | undefined;
    special_skill?: string | undefined;
    quirks?: string[] | undefined;
    moral_stance?: string | undefined;
    potential_arc?: string | undefined;
    qdrant_id?: string | undefined;
    created_at?: string | undefined;
}, {
    name: string;
    project_id: string;
    id?: string | undefined;
    archetype?: string | undefined;
    core_motivation?: string | undefined;
    inner_trap?: string | undefined;
    psychological_wound?: string | undefined;
    coping_mechanism?: string | undefined;
    deepest_fear?: string | undefined;
    breaking_point?: string | undefined;
    occupation_role?: string | undefined;
    affiliations?: string[] | undefined;
    visual_signature?: string | undefined;
    public_goal?: string | undefined;
    hidden_goal?: string | undefined;
    defining_moment?: string | undefined;
    family_background?: string | undefined;
    special_skill?: string | undefined;
    quirks?: string[] | undefined;
    moral_stance?: string | undefined;
    potential_arc?: string | undefined;
    qdrant_id?: string | undefined;
    created_at?: string | undefined;
}>;
/**
 * Worldbuilding schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 */
export declare const SupabaseWorldbuildingSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    project_id: z.ZodString;
    element_type: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    attributes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    qdrant_id: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    project_id: string;
    element_type: string;
    description: string;
    id?: string | undefined;
    qdrant_id?: string | undefined;
    created_at?: string | undefined;
    attributes?: Record<string, unknown> | undefined;
}, {
    name: string;
    project_id: string;
    element_type: string;
    description: string;
    id?: string | undefined;
    qdrant_id?: string | undefined;
    created_at?: string | undefined;
    attributes?: Record<string, unknown> | undefined;
}>;
/**
 * Draft schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 */
export declare const SupabaseDraftSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    project_id: z.ZodString;
    scene_number: z.ZodNumber;
    title: z.ZodOptional<z.ZodString>;
    setting_description: z.ZodOptional<z.ZodString>;
    sensory_details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    narrative_content: z.ZodString;
    dialogue_entries: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
    subtext_layer: z.ZodOptional<z.ZodString>;
    emotional_shift: z.ZodOptional<z.ZodString>;
    word_count: z.ZodOptional<z.ZodNumber>;
    show_dont_tell_ratio: z.ZodOptional<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["draft", "revision", "final"]>>;
    revision_count: z.ZodDefault<z.ZodNumber>;
    qdrant_id: z.ZodOptional<z.ZodString>;
    semantic_check_error: z.ZodOptional<z.ZodString>;
    contradiction_score: z.ZodOptional<z.ZodNumber>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "revision" | "draft" | "final";
    scene_number: number;
    project_id: string;
    narrative_content: string;
    revision_count: number;
    id?: string | undefined;
    qdrant_id?: string | undefined;
    created_at?: string | undefined;
    title?: string | undefined;
    setting_description?: string | undefined;
    sensory_details?: Record<string, unknown> | undefined;
    dialogue_entries?: unknown[] | undefined;
    subtext_layer?: string | undefined;
    emotional_shift?: string | undefined;
    word_count?: number | undefined;
    show_dont_tell_ratio?: number | undefined;
    semantic_check_error?: string | undefined;
    contradiction_score?: number | undefined;
    updated_at?: string | undefined;
}, {
    scene_number: number;
    project_id: string;
    narrative_content: string;
    status?: "revision" | "draft" | "final" | undefined;
    id?: string | undefined;
    qdrant_id?: string | undefined;
    created_at?: string | undefined;
    title?: string | undefined;
    setting_description?: string | undefined;
    sensory_details?: Record<string, unknown> | undefined;
    dialogue_entries?: unknown[] | undefined;
    subtext_layer?: string | undefined;
    emotional_shift?: string | undefined;
    word_count?: number | undefined;
    show_dont_tell_ratio?: number | undefined;
    revision_count?: number | undefined;
    semantic_check_error?: string | undefined;
    contradiction_score?: number | undefined;
    updated_at?: string | undefined;
}>;
/**
 * Validation error class for Supabase operations
 */
export declare class SupabaseValidationError extends Error {
    readonly zodError: z.ZodError;
    readonly operation: string;
    readonly recordType: string;
    constructor(zodError: z.ZodError, operation: string, recordType: string);
}
//# sourceMappingURL=SupabaseSchemas.d.ts.map