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
export const SupabaseCharacterSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  name: z.string().min(1).max(500),
  archetype: z.string().max(200).optional(),
  core_motivation: z.string().max(1000).optional(),
  inner_trap: z.string().max(500).optional(),
  psychological_wound: z.string().max(1000).optional(),
  coping_mechanism: z.string().max(500).optional(),
  deepest_fear: z.string().max(500).optional(),
  breaking_point: z.string().max(500).optional(),
  occupation_role: z.string().max(200).optional(),
  affiliations: z.array(z.string().max(200)).optional(),
  visual_signature: z.string().max(1000).optional(),
  public_goal: z.string().max(1000).optional(),
  hidden_goal: z.string().max(1000).optional(),
  defining_moment: z.string().max(1000).optional(),
  family_background: z.string().max(1000).optional(),
  special_skill: z.string().max(500).optional(),
  quirks: z.array(z.string().max(200)).optional(),
  moral_stance: z.string().max(500).optional(),
  potential_arc: z.string().max(500).optional(),
  qdrant_id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
});

/**
 * Worldbuilding schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 */
export const SupabaseWorldbuildingSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  element_type: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  attributes: z.record(z.unknown()).optional(),
  qdrant_id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
});

/**
 * Draft schema for Supabase storage
 * Validates known fields, strips unknown keys (LLM compatibility)
 */
export const SupabaseDraftSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  scene_number: z.number().int().positive(),
  title: z.string().max(500).optional(),
  setting_description: z.string().max(2000).optional(),
  sensory_details: z.record(z.unknown()).optional(),
  narrative_content: z.string().min(1),
  dialogue_entries: z.array(z.unknown()).optional(),
  subtext_layer: z.string().max(2000).optional(),
  emotional_shift: z.string().max(500).optional(),
  word_count: z.number().int().nonnegative().optional(),
  show_dont_tell_ratio: z.number().optional(),
  status: z.enum(["draft", "revision", "final"]).default("draft"),
  revision_count: z.number().int().nonnegative().default(0),
  qdrant_id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

/**
 * Validation error class for Supabase operations
 */
export class SupabaseValidationError extends Error {
  constructor(
    public readonly zodError: z.ZodError,
    public readonly operation: string,
    public readonly recordType: string
  ) {
    const errorSummary = zodError.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    super(
      `Supabase validation failed for ${operation} (${recordType}): ${errorSummary}`
    );
    this.name = "SupabaseValidationError";
  }
}
