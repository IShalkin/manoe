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
      // Pick the first field that is a NON-BLANK string, so a whitespace-only
      // `name` falls through to fullName/characterName instead of blocking them.
      const candidate = [charObj.name, charObj.fullName, charObj.characterName].find(
        (v): v is string => typeof v === "string" && v.trim().length > 0
      );
      if (candidate) {
        names.push(candidate.trim());
      }
    }
  }

  if (names.length === 0) {
    return "No named characters established yet.";
  }

  return names.map((name) => `- ${name}`).join("\n");
}
