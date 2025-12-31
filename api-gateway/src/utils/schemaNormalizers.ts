/**
 * Schema Normalizers
 * 
 * Normalization layer for LLM outputs to handle various response formats
 * before Zod validation. LLMs often return data in different structures
 * (wrapped in objects, different key names, etc.) that need to be normalized.
 */

/**
 * Convert any value to a prompt-safe string
 * Prevents [object Object] bugs when interpolating unknown values into prompts
 * 
 * @param value - Any value that needs to be converted to string
 * @returns A string representation safe for use in prompts
 */
export function stringifyForPrompt(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Safely parse a word count value, handling various formats
 * Prevents NaN issues when outline.wordCount is a string like "1,900"
 * 
 * @param value - The word count value (could be number, string, undefined)
 * @param defaultValue - Default value if parsing fails (default: 1500)
 * @returns A valid number for word count
 */
export function safeParseWordCount(value: unknown, defaultValue: number = 1500): number {
  if (typeof value === "number" && !isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    // Remove commas and other non-numeric characters except digits
    const cleaned = value.replace(/[^\d]/g, "");
    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultValue;
}

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

/**
 * Normalize a worldbuilding element for storage
 * Extracts name and description from various field formats
 * Used by SupabaseService.saveWorldbuilding
 *
 * @param elementType - Type of worldbuilding element
 * @param element - Raw element object
 * @returns Normalized element with guaranteed name and description
 */
export function normalizeWorldbuildingElement(
  elementType: string,
  element: Record<string, unknown>
): { name: string; description: string; attributes: Record<string, unknown> } {
  const attributes = { ...element };

  // Extract name from various possible fields
  const name = String(
    element.name ||
    element.Name ||
    element.title ||
    element.Title ||
    element.location ||
    `Unknown ${elementType}`
  );

  // Extract description from various possible fields
  const description = String(
    element.description ||
    element.Description ||
    element.content ||
    element.Content ||
    element.details ||
    element.summary ||
    "No description provided"
  );

  return { name, description, attributes };
}

/**
 * Normalize character data from LLM output to Supabase storage format
 * Maps LLM field names to database column names
 */

/**
 * Normalize character data from LLM output to Supabase storage format
 */
export function normalizeCharacterForStorage(
  character: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const stringFields = new Set([
    'archetype', 'core_motivation', 'potential_arc', 'family_background',
    'inner_trap', 'psychological_wound', 'coping_mechanism', 'deepest_fear',
    'breaking_point', 'occupation_role', 'visual_signature', 'public_goal',
    'hidden_goal', 'defining_moment', 'special_skill', 'moral_stance', 'name'
  ]);
  const fieldMappings: Record<string, string> = {
    role: 'archetype', motivation: 'core_motivation', character_arc: 'potential_arc',
    backstory: 'family_background', name: 'name', archetype: 'archetype',
    core_motivation: 'core_motivation', inner_trap: 'inner_trap',
    psychological_wound: 'psychological_wound', coping_mechanism: 'coping_mechanism',
    deepest_fear: 'deepest_fear', breaking_point: 'breaking_point',
    occupation_role: 'occupation_role', affiliations: 'affiliations',
    visual_signature: 'visual_signature', public_goal: 'public_goal',
    hidden_goal: 'hidden_goal', defining_moment: 'defining_moment',
    family_background: 'family_background', special_skill: 'special_skill',
    quirks: 'quirks', moral_stance: 'moral_stance', potential_arc: 'potential_arc',
  };
  for (const [key, value] of Object.entries(character)) {
    const mappedKey = fieldMappings[key];
    if (mappedKey && value !== undefined && value !== null) {
      if (normalized[mappedKey] === undefined) {
        if (stringFields.has(mappedKey) && typeof value === 'object') {
          normalized[mappedKey] = JSON.stringify(value);
        } else {
          normalized[mappedKey] = value;
        }
      }
    }
  }
  if (!normalized.name && character.name) {
    normalized.name = character.name;
  }
  return normalized;
}
