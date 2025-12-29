/**
 * Schema Normalizers
 *
 * Normalization layer for LLM outputs to handle various response formats
 * before Zod validation. LLMs often return data in different structures
 * (wrapped in objects, different key names, etc.) that need to be normalized.
 */
/**
 * Normalize characters output from LLM
 * Handles various wrapper formats and normalizes individual character fields
 *
 * @param raw - Raw LLM output (could be array, object with characters key, etc.)
 * @returns Normalized array of character objects
 */
export declare function normalizeCharacters(raw: unknown): Record<string, unknown>[];
/**
 * Normalize worldbuilding output from LLM
 * Handles wrapper formats and ensures consistent structure
 *
 * @param raw - Raw LLM output
 * @returns Normalized worldbuilding object
 */
export declare function normalizeWorldbuilding(raw: unknown): Record<string, unknown>;
/**
 * Normalize narrative/genesis output from LLM
 * Handles wrapper formats and field name variations
 *
 * @param raw - Raw LLM output
 * @returns Normalized narrative object
 */
export declare function normalizeNarrative(raw: unknown): Record<string, unknown>;
/**
 * Normalize outline output from LLM
 * Handles wrapper formats and ensures scenes array exists
 *
 * @param raw - Raw LLM output
 * @returns Normalized outline object with scenes array
 */
export declare function normalizeOutline(raw: unknown): Record<string, unknown>;
/**
 * Normalize critique output from LLM
 * Handles various field name formats
 *
 * @param raw - Raw LLM output
 * @returns Normalized critique object
 */
export declare function normalizeCritique(raw: unknown): Record<string, unknown>;
//# sourceMappingURL=schemaNormalizers.d.ts.map