/**
 * Render key constraints into the prompt block, extracted from BaseAgent so
 * agents and tests share one definition. REAL format: `- key: value (Scene N)`,
 * empty list -> "No constraints established yet.". Pure.
 */
export function buildConstraintsBlock(
  constraints: { key: string; value: string; sceneNumber: number }[]
): string {
  if (constraints.length === 0) {
    return "No constraints established yet.";
  }
  return constraints
    .map((c) => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`)
    .join("\n");
}
