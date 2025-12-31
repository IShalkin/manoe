/**
 * String utility functions for data transformation
 */

/**
 * Converts a single camelCase string to snake_case
 * @param str - The camelCase string to convert
 * @returns The snake_case version of the string
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively converts all keys in an object from camelCase to snake_case
 * @param obj - The object with camelCase keys
 * @returns A new object with snake_case keys
 */
export function camelToSnakeCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "object" && item !== null
        ? camelToSnakeCase(item as Record<string, unknown>)
        : item
    ) as unknown as Record<string, unknown>;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[snakeKey] = camelToSnakeCase(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[snakeKey] = value.map((item) =>
        typeof item === "object" && item !== null
          ? camelToSnakeCase(item as Record<string, unknown>)
          : item
      );
    } else {
      result[snakeKey] = value;
    }
  }

  return result;
}
