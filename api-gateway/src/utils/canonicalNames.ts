/**
 * Build the canonical-names block from character profiles, extracted from
 * WriterAgent so prod and tests share one definition. Prevents "name amnesia"
 * during revision. Pure.
 */
export function buildCanonicalNamesBlock(characters: unknown): string {
  if (!characters || !Array.isArray(characters)) {
    return "No characters established yet.";
  }

  const names: string[] = [];
  for (const char of characters) {
    if (typeof char === "object" && char !== null) {
      const charObj = char as Record<string, unknown>;
      const name = charObj.name || charObj.fullName || charObj.characterName;
      if (typeof name === "string" && name.trim()) {
        names.push(name.trim());
      }
    }
  }

  if (names.length === 0) {
    return "No named characters established yet.";
  }

  return names.map((name) => `- ${name}`).join("\n");
}
