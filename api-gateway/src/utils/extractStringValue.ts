/**
 * Extract a string value from a field that might be a string or an object.
 * Extracted from StorytellerOrchestrator (issue: shadow-copy tests) so prod and
 * the test exercise the same code. Handles LLM responses that return
 * `{ name, description, ... }` where a plain string was expected, preventing
 * `[object Object]` from leaking into constraints. Pure.
 */
export function extractStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.theme === "string") return obj.theme;
    if (typeof obj.description === "string") return obj.description;
    if (typeof obj.type === "string") return obj.type;
    if (typeof obj.structure === "string") return obj.structure;
    return JSON.stringify(value);
  }
  return "";
}
