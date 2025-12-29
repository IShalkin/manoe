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
export function normalizeCharacters(raw: unknown): Record<string, unknown>[] {
  if (raw === null || raw === undefined) {
    return [];
  }

  if (typeof raw === "object" && raw !== null && "characters" in raw) {
    return normalizeCharacters((raw as Record<string, unknown>).characters);
  }

  if (typeof raw === "object" && raw !== null && "data" in raw) {
    return normalizeCharacters((raw as Record<string, unknown>).data);
  }

  if (typeof raw === "object" && raw !== null && "result" in raw) {
    return normalizeCharacters((raw as Record<string, unknown>).result);
  }

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return [normalizeCharacter(raw as Record<string, unknown>)];
  }

  if (Array.isArray(raw)) {
    return raw.map((c) => normalizeCharacter(c as Record<string, unknown>));
  }

  return [];
}

/**
 * Normalize a single character object
 * Handles field name variations and type conversions
 */
function normalizeCharacter(char: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...char };

  if (!normalized.name) {
    normalized.name =
      normalized.Name ||
      normalized.fullName ||
      normalized.full_name ||
      normalized.characterName ||
      normalized.character_name ||
      "Unknown";
  }

  if (normalized.role && typeof normalized.role === "string") {
    const roleMap: Record<string, string> = {
      hero: "protagonist",
      villain: "antagonist",
      main: "protagonist",
      "main character": "protagonist",
      secondary: "supporting",
      side: "supporting",
      "side character": "supporting",
      minor: "supporting",
    };
    const lowerRole = normalized.role.toLowerCase();
    normalized.role = roleMap[lowerRole] || lowerRole;
  }

  if (!normalized.psychology && normalized.Psychology) {
    normalized.psychology = normalized.Psychology;
  }

  if (!normalized.backstory && normalized.Backstory) {
    normalized.backstory = normalized.Backstory;
  }

  if (!normalized.motivation && normalized.Motivation) {
    normalized.motivation = normalized.Motivation;
  }

  return normalized;
}

/**
 * Normalize worldbuilding output from LLM
 * Handles wrapper formats and ensures consistent structure
 * 
 * @param raw - Raw LLM output
 * @returns Normalized worldbuilding object
 */
export function normalizeWorldbuilding(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    return { raw };
  }

  const obj = raw as Record<string, unknown>;

  if ("worldbuilding" in obj) {
    return normalizeWorldbuilding(obj.worldbuilding);
  }

  if ("world" in obj) {
    return normalizeWorldbuilding(obj.world);
  }

  if ("data" in obj && typeof obj.data === "object") {
    return normalizeWorldbuilding(obj.data);
  }

  return obj;
}

/**
 * Normalize narrative/genesis output from LLM
 * Handles wrapper formats and field name variations
 * 
 * @param raw - Raw LLM output
 * @returns Normalized narrative object
 */
export function normalizeNarrative(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    return { raw };
  }

  const obj = raw as Record<string, unknown>;

  if ("narrative" in obj) {
    return normalizeNarrative(obj.narrative);
  }

  if ("genesis" in obj) {
    return normalizeNarrative(obj.genesis);
  }

  if ("data" in obj && typeof obj.data === "object") {
    return normalizeNarrative(obj.data);
  }

  const normalized = { ...obj };

  if (!normalized.premise && normalized.Premise) {
    normalized.premise = normalized.Premise;
  }

  if (!normalized.hook && normalized.Hook) {
    normalized.hook = normalized.Hook;
  }

  if (!normalized.themes && normalized.Themes) {
    normalized.themes = normalized.Themes;
  }

  if (!normalized.arc && normalized.Arc) {
    normalized.arc = normalized.Arc;
  }

  if (!normalized.tone && normalized.Tone) {
    normalized.tone = normalized.Tone;
  }

  return normalized;
}

/**
 * Normalize outline output from LLM
 * Handles wrapper formats and ensures scenes array exists
 * 
 * @param raw - Raw LLM output
 * @returns Normalized outline object with scenes array
 */
export function normalizeOutline(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    return { scenes: [] };
  }

  const obj = raw as Record<string, unknown>;

  if ("outline" in obj) {
    return normalizeOutline(obj.outline);
  }

  if ("data" in obj && typeof obj.data === "object") {
    return normalizeOutline(obj.data);
  }

  if (Array.isArray(obj)) {
    return { scenes: obj.map((s, i) => normalizeScene(s as Record<string, unknown>, i + 1)) };
  }

  if ("scenes" in obj && Array.isArray(obj.scenes)) {
    return {
      ...obj,
      scenes: (obj.scenes as Record<string, unknown>[]).map((s, i) => normalizeScene(s, i + 1)),
    };
  }

  return { scenes: [] };
}

/**
 * Normalize a single scene object
 */
function normalizeScene(scene: Record<string, unknown>, index: number): Record<string, unknown> {
  const normalized = { ...scene };

  if (!normalized.sceneNumber && normalized.scene_number) {
    normalized.sceneNumber = normalized.scene_number;
  }

  if (!normalized.sceneNumber && normalized.number) {
    normalized.sceneNumber = normalized.number;
  }

  if (!normalized.sceneNumber) {
    normalized.sceneNumber = index;
  }

  if (!normalized.title && normalized.Title) {
    normalized.title = normalized.Title;
  }

  if (!normalized.title && normalized.name) {
    normalized.title = normalized.name;
  }

  if (!normalized.title) {
    normalized.title = `Scene ${index}`;
  }

  return normalized;
}

/**
 * Normalize critique output from LLM
 * Handles various field name formats
 * 
 * @param raw - Raw LLM output
 * @returns Normalized critique object
 */
export function normalizeCritique(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const obj = raw as Record<string, unknown>;

  if ("critique" in obj) {
    return normalizeCritique(obj.critique);
  }

  if ("feedback" in obj) {
    return normalizeCritique(obj.feedback);
  }

  const normalized = { ...obj };

  if (normalized.revisionNeeded !== undefined && normalized.revision_needed === undefined) {
    normalized.revision_needed = normalized.revisionNeeded;
  }

  if (normalized.revision_requests !== undefined && normalized.revisionRequests === undefined) {
    normalized.revisionRequests = normalized.revision_requests;
  }

  return normalized;
}
