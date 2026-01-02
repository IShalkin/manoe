/**
 * Zod Schemas for Agent Outputs
 * 
 * Validates LLM outputs from all agents to ensure data quality and type safety
 */

import { z } from "zod";

/**
 * Flexible type for fields that can be string, object, or array
 * LLMs often return different formats for the same field
 */
export const FlexibleStringOrObject = z.union([
  z.string(),
  z.record(z.unknown()),
  z.array(z.unknown()),
]).optional();

/**
 * Theme schema - can be a string or an object with name/description
 */
const ThemeSchema = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    theme: z.string().optional(),
    description: z.string().optional(),
    exploration: z.string().optional(),
  }).passthrough(),
]);

/**
 * Arc schema - can be a string or a structured object
 */
const ArcSchema = z.union([
  z.string(),
  z.object({
    structure: z.string().optional(),
    type: z.string().optional(),
    acts: z.array(z.unknown()).optional(),
    setup: z.string().optional(),
    confrontation: z.string().optional(),
    resolution: z.string().optional(),
  }).passthrough(),
]);

/**
 * Narrative schema (from ArchitectAgent - Genesis phase)
 * Flexible to handle various LLM output formats
 */
export const NarrativeSchema = z.object({
  premise: z.string().min(1),
  hook: z.string().min(1),
  themes: z.union([
    z.array(ThemeSchema).min(1),
    z.object({}).passthrough(), // Allow object format for themes
  ]),
  arc: ArcSchema,
  tone: z.union([z.string(), z.object({}).passthrough()]),
  audience: z.union([z.string(), z.object({}).passthrough()]).optional(),
  genre: z.union([z.string(), z.object({}).passthrough()]).optional(),
});

/**
 * Character schema (from ProfilerAgent - Characters phase)
 * Made flexible to handle various LLM output formats
 */
export const CharacterSchema = z.object({
  name: z.string().min(1),
  // Accept both lowercase and title case roles
  role: z.string().transform((val) => val.toLowerCase()).pipe(
    z.enum(["protagonist", "antagonist", "supporting"])
  ).or(z.string()), // Fallback to any string if transform fails
  archetype: z.string().optional(),
  // Make motivation optional since LLM doesn't always return it
  motivation: z.string().optional(),
  psychology: z.object({
    wound: z.string().optional(),
    innerTrap: z.string().optional(),
    arc: z.string().optional(),
  }).passthrough().optional(),
  backstory: z.string().optional(),
  visual: z.string().optional(),
  voice: z.string().optional(),
  // Accept string, array, or object for relationships (LLM returns various formats)
  relationships: z.union([
    z.string(),
    z.array(z.string()),
    z.record(z.unknown()),
  ]).optional(),
}).passthrough(); // Allow additional fields from LLM

/**
 * Characters array schema
 */
export const CharactersArraySchema = z.array(CharacterSchema).min(1);

/**
 * Worldbuilding schema (from WorldbuilderAgent)
 * Uses FlexibleStringOrObject for fields that LLMs return in various formats
 */
export const WorldbuildingSchema = z.object({
  geography: z.union([z.string(), z.record(z.unknown())]).optional(),
  timePeriod: FlexibleStringOrObject,
  technology: FlexibleStringOrObject,
  socialStructures: z.union([z.string(), z.record(z.unknown())]).optional(),
  culture: z.union([z.string(), z.record(z.unknown())]).optional(),
  economy: FlexibleStringOrObject,
  magic: z.union([z.string(), z.record(z.unknown())]).optional(),
  history: FlexibleStringOrObject,
  sensory: z.union([z.string(), z.record(z.unknown())]).optional(),
}).passthrough();

/**
 * Flexible type for scene fields that can be string or array
 * LLMs often return dialogue, characters, etc. as arrays instead of strings
 */
const FlexibleSceneField = z.union([
  z.string(),
  z.array(z.string()),
  z.array(z.unknown()),
]).optional();

/**
 * Outline schema (from StrategistAgent - Outlining phase)
 * Made flexible to handle various LLM output formats
 */
export const OutlineSchema = z.object({
  scenes: z.array(z.object({
    sceneNumber: z.number().optional(),
    title: z.string().min(1),
    setting: FlexibleSceneField,
    characters: z.union([z.array(z.string()), z.array(z.unknown()), z.string()]).optional(),
    goal: FlexibleSceneField,
    conflict: FlexibleSceneField,
    emotionalBeat: FlexibleSceneField,
    dialogue: FlexibleSceneField,
    hook: FlexibleSceneField,
    wordCount: z.number().optional(),
  }).passthrough()).min(1),
}).passthrough();

/**
 * Advanced Plan schema (from StrategistAgent - Advanced Planning phase)
 */
export const AdvancedPlanSchema = z.object({
  motifs: z.record(z.unknown()).optional(),
  subtext: z.record(z.unknown()).optional(),
  emotionalBeats: z.record(z.unknown()).optional(),
  sensory: z.record(z.unknown()).optional(),
  contradictions: z.record(z.unknown()).optional(),
  deepening: z.record(z.unknown()).optional(),
  complexity: z.record(z.unknown()).optional(),
});

/**
 * Critique schema (from CriticAgent)
 */
export const CritiqueSchema = z.object({
  approved: z.boolean().optional(),
  score: z.number().min(1).max(10).optional(),
  revision_needed: z.boolean().optional(),
  strengths: z.array(z.string()).optional(),
  issues: z.array(z.string()).optional(),
  revisionRequests: z.array(z.string()).optional(),
});

/**
 * Originality Report schema (from OriginalityAgent)
 */
export const OriginalityReportSchema = z.object({
  originality_score: z.number().min(1).max(10),
  cliches_found: z.array(z.string()),
  suggestions: z.array(z.string()),
});

/**
 * Impact Report schema (from ImpactAgent)
 */
export const ImpactReportSchema = z.object({
  impact_score: z.number().min(1).max(10),
  emotional_beats: z.array(z.string()),
  engagement_level: z.enum(["high", "medium", "low"]),
  recommendations: z.array(z.string()),
});

/**
 * Archivist constraint item schema
 */
const ArchivistConstraintSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  sceneNumber: z.number(),
  reasoning: z.string().optional(),
});

/**
 * Normalize character status from LLM output to valid enum value
 * Maps common variations to standard values
 */
const normalizeCharacterStatus = (val: unknown): "alive" | "dead" | "unknown" | "transformed" | undefined => {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== "string") return undefined;
  
  const lower = val.toLowerCase().trim();
  
  // Map to "alive"
  if (["alive", "active", "living", "healthy", "well", "present"].includes(lower)) {
    return "alive";
  }
  // Map to "dead"
  if (["dead", "deceased", "killed", "died", "perished"].includes(lower)) {
    return "dead";
  }
  // Map to "transformed"
  if (["transformed", "changed", "mutated", "evolved", "altered"].includes(lower)) {
    return "transformed";
  }
  // Default to "unknown" for unrecognized values
  return "unknown";
};

/**
 * Normalize event significance from LLM output to valid enum value
 * Maps common variations and descriptions to standard values
 */
const normalizeSignificance = (val: unknown): "major" | "minor" | "background" | undefined => {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== "string") return undefined;
  
  const lower = val.toLowerCase().trim();
  
  // Map to "major" - check for keywords indicating high importance
  if (lower === "major") {
    return "major";
  }
  // Only use includes() if the string doesn't contain conflicting keywords
  // This prevents "slightly critical" from being classified as "major"
  // Use word boundaries to avoid matching "minor" in "minority" etc.
  if (!/\b(small|slight|minor)\b/.test(lower)) {
    if (lower.includes("critical") || 
        lower.includes("turning point") ||
        lower.includes("pivotal") ||
        lower.includes("key") ||
        lower.includes("crucial") ||
        lower.includes("significant")) {
      return "major";
    }
  }
  // Map to "minor"
  if (lower === "minor" || lower.includes("small") || lower.includes("slight")) {
    return "minor";
  }
  // Map to "background"
  if (lower === "background" || lower.includes("flavor") || lower.includes("ambient") || lower.includes("detail")) {
    return "background";
  }
  // Default to "minor" for unrecognized values (safer than major)
  return "minor";
};

/**
 * Preprocess null to undefined for optional string fields
 */
const nullToUndefined = (val: unknown): string | undefined => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "string") return val.trim() || undefined;
  // Coerce numbers and booleans to strings for robustness (LLMs may return varied types)
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return undefined;
};

/**
 * Archivist Output schema (from ArchivistAgent)
 * Uses preprocessing to filter out invalid constraints (null values, empty strings)
 * before validation to handle LLM returning malformed data
 */
export const ArchivistOutputSchema = z.object({
  constraints: z.preprocess(
    (val) => {
      // If constraints is null/undefined, return undefined (optional field)
      if (val === null || val === undefined) {
        return undefined;
      }
      // If not an array, return as-is and let validation fail
      if (!Array.isArray(val)) {
        return val;
      }
      // Filter out constraints with null/undefined/empty key or value
      return val.filter((item): item is Record<string, unknown> => {
        if (item === null || item === undefined || typeof item !== "object") {
          return false;
        }
        const obj = item as Record<string, unknown>;
        // Keep only constraints where key and value are non-empty strings and sceneNumber is a valid number
        return (
          typeof obj.key === "string" &&
          obj.key.length > 0 &&
          typeof obj.value === "string" &&
          obj.value.length > 0 &&
          typeof obj.sceneNumber === "number" &&
          !isNaN(obj.sceneNumber)
        );
      });
    },
    z.array(ArchivistConstraintSchema).optional()
  ),
  conflicts_resolved: z.array(z.string()).optional(),
  discarded_facts: z.array(z.string()).optional(),
  worldStateDiff: z.object({
    characterUpdates: z.preprocess(
      (val) => {
        if (!Array.isArray(val)) return val;
        // Normalize each character update's status and currentLocation
        return val.map((item) => {
          if (typeof item !== "object" || item === null) return item;
          const obj = item as Record<string, unknown>;
          return {
            ...obj,
            status: normalizeCharacterStatus(obj.status),
            currentLocation: nullToUndefined(obj.currentLocation),
          };
        });
      },
      z.array(z.object({
        name: z.string(),
        status: z.enum(["alive", "dead", "unknown", "transformed"]).optional(),
        currentLocation: z.string().optional(),
        newAttributes: z.record(z.string()).optional(),
      })).optional()
    ),
    newLocations: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
    })).optional(),
    timelineEvents: z.preprocess(
      (val) => {
        if (!Array.isArray(val)) return val;
        // Normalize each timeline event's significance
        return val.map((item) => {
          if (typeof item !== "object" || item === null) return item;
          const obj = item as Record<string, unknown>;
          return {
            ...obj,
            significance: normalizeSignificance(obj.significance),
          };
        });
      },
      z.array(z.object({
        event: z.string(),
        significance: z.enum(["major", "minor", "background"]).optional(),
      })).optional()
    ),
  }).optional(),
});

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(
    public readonly zodError: z.ZodError,
    public readonly agentType: string
  ) {
    super(`Validation failed for ${agentType}: ${zodError.message}`);
    this.name = "ValidationError";
  }
}

