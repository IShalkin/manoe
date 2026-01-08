/**
 * String utility functions for data transformation
 *
 * Naming Convention Strategy:
 * - TypeScript code uses camelCase (e.g., sceneNumber, runId, projectId)
 * - Database (Supabase) uses snake_case (e.g., scene_number, run_id, project_id)
 * - These utilities provide bidirectional conversion at API boundaries
 */
/**
 * Recursively converts all keys in an object from camelCase to snake_case
 * @param obj - The object with camelCase keys
 * @returns A new object with snake_case keys
 */
export declare function camelToSnakeCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown>;
/**
 * Recursively converts all keys in an object from snake_case to camelCase
 * Used when reading data from Supabase to convert to TypeScript conventions
 * @param obj - The object with snake_case keys
 * @returns A new object with camelCase keys
 */
export declare function snakeToCamelCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown>;
//# sourceMappingURL=stringUtils.d.ts.map