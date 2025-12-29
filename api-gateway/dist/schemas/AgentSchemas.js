"use strict";
/**
 * Zod Schemas for Agent Outputs
 *
 * Validates LLM outputs from all agents to ensure data quality and type safety
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.ArchivistOutputSchema = exports.ImpactReportSchema = exports.OriginalityReportSchema = exports.CritiqueSchema = exports.AdvancedPlanSchema = exports.OutlineSchema = exports.WorldbuildingSchema = exports.CharactersArraySchema = exports.CharacterSchema = exports.NarrativeSchema = exports.FlexibleStringOrObject = void 0;
const zod_1 = require("zod");
/**
 * Flexible type for fields that can be string, object, or array
 * LLMs often return different formats for the same field
 */
exports.FlexibleStringOrObject = zod_1.z.union([
    zod_1.z.string(),
    zod_1.z.record(zod_1.z.unknown()),
    zod_1.z.array(zod_1.z.unknown()),
]).optional();
/**
 * Theme schema - can be a string or an object with name/description
 */
const ThemeSchema = zod_1.z.union([
    zod_1.z.string(),
    zod_1.z.object({
        name: zod_1.z.string().optional(),
        theme: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        exploration: zod_1.z.string().optional(),
    }).passthrough(),
]);
/**
 * Arc schema - can be a string or a structured object
 */
const ArcSchema = zod_1.z.union([
    zod_1.z.string(),
    zod_1.z.object({
        structure: zod_1.z.string().optional(),
        type: zod_1.z.string().optional(),
        acts: zod_1.z.array(zod_1.z.unknown()).optional(),
        setup: zod_1.z.string().optional(),
        confrontation: zod_1.z.string().optional(),
        resolution: zod_1.z.string().optional(),
    }).passthrough(),
]);
/**
 * Narrative schema (from ArchitectAgent - Genesis phase)
 * Flexible to handle various LLM output formats
 */
exports.NarrativeSchema = zod_1.z.object({
    premise: zod_1.z.string().min(1),
    hook: zod_1.z.string().min(1),
    themes: zod_1.z.union([
        zod_1.z.array(ThemeSchema).min(1),
        zod_1.z.object({}).passthrough(), // Allow object format for themes
    ]),
    arc: ArcSchema,
    tone: zod_1.z.union([zod_1.z.string(), zod_1.z.object({}).passthrough()]),
    audience: zod_1.z.union([zod_1.z.string(), zod_1.z.object({}).passthrough()]).optional(),
    genre: zod_1.z.union([zod_1.z.string(), zod_1.z.object({}).passthrough()]).optional(),
});
/**
 * Character schema (from ProfilerAgent - Characters phase)
 * Made flexible to handle various LLM output formats
 */
exports.CharacterSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    // Accept both lowercase and title case roles
    role: zod_1.z.string().transform((val) => val.toLowerCase()).pipe(zod_1.z.enum(["protagonist", "antagonist", "supporting"])).or(zod_1.z.string()), // Fallback to any string if transform fails
    archetype: zod_1.z.string().optional(),
    // Make motivation optional since LLM doesn't always return it
    motivation: zod_1.z.string().optional(),
    psychology: zod_1.z.object({
        wound: zod_1.z.string().optional(),
        innerTrap: zod_1.z.string().optional(),
        arc: zod_1.z.string().optional(),
    }).passthrough().optional(),
    backstory: zod_1.z.string().optional(),
    visual: zod_1.z.string().optional(),
    voice: zod_1.z.string().optional(),
    // Accept string, array, or object for relationships (LLM returns various formats)
    relationships: zod_1.z.union([
        zod_1.z.string(),
        zod_1.z.array(zod_1.z.string()),
        zod_1.z.record(zod_1.z.unknown()),
    ]).optional(),
}).passthrough(); // Allow additional fields from LLM
/**
 * Characters array schema
 */
exports.CharactersArraySchema = zod_1.z.array(exports.CharacterSchema).min(1);
/**
 * Worldbuilding schema (from WorldbuilderAgent)
 * Uses FlexibleStringOrObject for fields that LLMs return in various formats
 */
exports.WorldbuildingSchema = zod_1.z.object({
    geography: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.unknown())]).optional(),
    timePeriod: exports.FlexibleStringOrObject,
    technology: exports.FlexibleStringOrObject,
    socialStructures: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.unknown())]).optional(),
    culture: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.unknown())]).optional(),
    economy: exports.FlexibleStringOrObject,
    magic: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.unknown())]).optional(),
    history: exports.FlexibleStringOrObject,
    sensory: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.unknown())]).optional(),
}).passthrough();
/**
 * Outline schema (from StrategistAgent - Outlining phase)
 */
exports.OutlineSchema = zod_1.z.object({
    scenes: zod_1.z.array(zod_1.z.object({
        sceneNumber: zod_1.z.number().optional(),
        title: zod_1.z.string().min(1),
        setting: zod_1.z.string().optional(),
        characters: zod_1.z.array(zod_1.z.string()).optional(),
        goal: zod_1.z.string().optional(),
        conflict: zod_1.z.string().optional(),
        emotionalBeat: zod_1.z.string().optional(),
        dialogue: zod_1.z.string().optional(),
        hook: zod_1.z.string().optional(),
        wordCount: zod_1.z.number().optional(),
    })).min(1),
});
/**
 * Advanced Plan schema (from StrategistAgent - Advanced Planning phase)
 */
exports.AdvancedPlanSchema = zod_1.z.object({
    motifs: zod_1.z.record(zod_1.z.unknown()).optional(),
    subtext: zod_1.z.record(zod_1.z.unknown()).optional(),
    emotionalBeats: zod_1.z.record(zod_1.z.unknown()).optional(),
    sensory: zod_1.z.record(zod_1.z.unknown()).optional(),
    contradictions: zod_1.z.record(zod_1.z.unknown()).optional(),
    deepening: zod_1.z.record(zod_1.z.unknown()).optional(),
    complexity: zod_1.z.record(zod_1.z.unknown()).optional(),
});
/**
 * Critique schema (from CriticAgent)
 */
exports.CritiqueSchema = zod_1.z.object({
    approved: zod_1.z.boolean().optional(),
    score: zod_1.z.number().min(1).max(10).optional(),
    revision_needed: zod_1.z.boolean().optional(),
    strengths: zod_1.z.array(zod_1.z.string()).optional(),
    issues: zod_1.z.array(zod_1.z.string()).optional(),
    revisionRequests: zod_1.z.array(zod_1.z.string()).optional(),
});
/**
 * Originality Report schema (from OriginalityAgent)
 */
exports.OriginalityReportSchema = zod_1.z.object({
    originality_score: zod_1.z.number().min(1).max(10),
    cliches_found: zod_1.z.array(zod_1.z.string()),
    suggestions: zod_1.z.array(zod_1.z.string()),
});
/**
 * Impact Report schema (from ImpactAgent)
 */
exports.ImpactReportSchema = zod_1.z.object({
    impact_score: zod_1.z.number().min(1).max(10),
    emotional_beats: zod_1.z.array(zod_1.z.string()),
    engagement_level: zod_1.z.enum(["high", "medium", "low"]),
    recommendations: zod_1.z.array(zod_1.z.string()),
});
/**
 * Archivist Output schema (from ArchivistAgent)
 */
exports.ArchivistOutputSchema = zod_1.z.object({
    constraints: zod_1.z.array(zod_1.z.object({
        key: zod_1.z.string().min(1),
        value: zod_1.z.string().min(1),
        sceneNumber: zod_1.z.number(),
        reasoning: zod_1.z.string().optional(),
    })).optional(),
    conflicts_resolved: zod_1.z.array(zod_1.z.string()).optional(),
    discarded_facts: zod_1.z.array(zod_1.z.string()).optional(),
});
/**
 * Validation error class
 */
class ValidationError extends Error {
    zodError;
    agentType;
    constructor(zodError, agentType) {
        super(`Validation failed for ${agentType}: ${zodError.message}`);
        this.zodError = zodError;
        this.agentType = agentType;
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
//# sourceMappingURL=AgentSchemas.js.map