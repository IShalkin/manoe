/**
 * Convert camelCase keys to snake_case
 * Used for transforming agent outputs (camelCase) to Supabase column names (snake_case)
 */

export function camelToSnakeCase<T = Record<string, unknown>>(
  obj: Record<string, unknown>
): T {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  
  return result as T;
}
