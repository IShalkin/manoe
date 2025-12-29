/**
 * Zod Schemas for Agent Outputs
 *
 * Validates LLM outputs from all agents to ensure data quality and type safety
 */
import { z } from "zod";
/**
 * Narrative schema (from ArchitectAgent - Genesis phase)
 * Flexible to handle various LLM output formats
 */
export declare const NarrativeSchema: z.ZodObject<{
    premise: z.ZodString;
    hook: z.ZodString;
    themes: z.ZodUnion<[z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        theme: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        exploration: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        name: z.ZodOptional<z.ZodString>;
        theme: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        exploration: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        name: z.ZodOptional<z.ZodString>;
        theme: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        exploration: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>]>, "many">, z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>]>;
    arc: z.ZodUnion<[z.ZodString, z.ZodObject<{
        structure: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
        acts: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
        setup: z.ZodOptional<z.ZodString>;
        confrontation: z.ZodOptional<z.ZodString>;
        resolution: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        structure: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
        acts: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
        setup: z.ZodOptional<z.ZodString>;
        confrontation: z.ZodOptional<z.ZodString>;
        resolution: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        structure: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
        acts: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
        setup: z.ZodOptional<z.ZodString>;
        confrontation: z.ZodOptional<z.ZodString>;
        resolution: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>]>;
    tone: z.ZodUnion<[z.ZodString, z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>]>;
    audience: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>]>>;
    genre: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>]>>;
}, "strip", z.ZodTypeAny, {
    themes: (string | z.objectOutputType<{
        name: z.ZodOptional<z.ZodString>;
        theme: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        exploration: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">)[] | z.objectOutputType<{}, z.ZodTypeAny, "passthrough">;
    premise: string;
    hook: string;
    arc: string | z.objectOutputType<{
        structure: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
        acts: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
        setup: z.ZodOptional<z.ZodString>;
        confrontation: z.ZodOptional<z.ZodString>;
        resolution: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">;
    tone: string | z.objectOutputType<{}, z.ZodTypeAny, "passthrough">;
    audience?: string | z.objectOutputType<{}, z.ZodTypeAny, "passthrough"> | undefined;
    genre?: string | z.objectOutputType<{}, z.ZodTypeAny, "passthrough"> | undefined;
}, {
    themes: (string | z.objectInputType<{
        name: z.ZodOptional<z.ZodString>;
        theme: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        exploration: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">)[] | z.objectInputType<{}, z.ZodTypeAny, "passthrough">;
    premise: string;
    hook: string;
    arc: string | z.objectInputType<{
        structure: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodString>;
        acts: z.ZodOptional<z.ZodArray<z.ZodUnknown, "many">>;
        setup: z.ZodOptional<z.ZodString>;
        confrontation: z.ZodOptional<z.ZodString>;
        resolution: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">;
    tone: string | z.objectInputType<{}, z.ZodTypeAny, "passthrough">;
    audience?: string | z.objectInputType<{}, z.ZodTypeAny, "passthrough"> | undefined;
    genre?: string | z.objectInputType<{}, z.ZodTypeAny, "passthrough"> | undefined;
}>;
/**
 * Character schema (from ProfilerAgent - Characters phase)
 * Made flexible to handle various LLM output formats
 */
export declare const CharacterSchema: z.ZodObject<{
    name: z.ZodString;
    role: z.ZodUnion<[z.ZodPipeline<z.ZodEffects<z.ZodString, string, string>, z.ZodEnum<["protagonist", "antagonist", "supporting"]>>, z.ZodString]>;
    archetype: z.ZodOptional<z.ZodString>;
    motivation: z.ZodOptional<z.ZodString>;
    psychology: z.ZodOptional<z.ZodObject<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
    backstory: z.ZodOptional<z.ZodString>;
    visual: z.ZodOptional<z.ZodString>;
    voice: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    name: z.ZodString;
    role: z.ZodUnion<[z.ZodPipeline<z.ZodEffects<z.ZodString, string, string>, z.ZodEnum<["protagonist", "antagonist", "supporting"]>>, z.ZodString]>;
    archetype: z.ZodOptional<z.ZodString>;
    motivation: z.ZodOptional<z.ZodString>;
    psychology: z.ZodOptional<z.ZodObject<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
    backstory: z.ZodOptional<z.ZodString>;
    visual: z.ZodOptional<z.ZodString>;
    voice: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    name: z.ZodString;
    role: z.ZodUnion<[z.ZodPipeline<z.ZodEffects<z.ZodString, string, string>, z.ZodEnum<["protagonist", "antagonist", "supporting"]>>, z.ZodString]>;
    archetype: z.ZodOptional<z.ZodString>;
    motivation: z.ZodOptional<z.ZodString>;
    psychology: z.ZodOptional<z.ZodObject<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
    backstory: z.ZodOptional<z.ZodString>;
    visual: z.ZodOptional<z.ZodString>;
    voice: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>;
/**
 * Characters array schema
 */
export declare const CharactersArraySchema: z.ZodArray<z.ZodObject<{
    name: z.ZodString;
    role: z.ZodUnion<[z.ZodPipeline<z.ZodEffects<z.ZodString, string, string>, z.ZodEnum<["protagonist", "antagonist", "supporting"]>>, z.ZodString]>;
    archetype: z.ZodOptional<z.ZodString>;
    motivation: z.ZodOptional<z.ZodString>;
    psychology: z.ZodOptional<z.ZodObject<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
    backstory: z.ZodOptional<z.ZodString>;
    visual: z.ZodOptional<z.ZodString>;
    voice: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    name: z.ZodString;
    role: z.ZodUnion<[z.ZodPipeline<z.ZodEffects<z.ZodString, string, string>, z.ZodEnum<["protagonist", "antagonist", "supporting"]>>, z.ZodString]>;
    archetype: z.ZodOptional<z.ZodString>;
    motivation: z.ZodOptional<z.ZodString>;
    psychology: z.ZodOptional<z.ZodObject<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
    backstory: z.ZodOptional<z.ZodString>;
    visual: z.ZodOptional<z.ZodString>;
    voice: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    name: z.ZodString;
    role: z.ZodUnion<[z.ZodPipeline<z.ZodEffects<z.ZodString, string, string>, z.ZodEnum<["protagonist", "antagonist", "supporting"]>>, z.ZodString]>;
    archetype: z.ZodOptional<z.ZodString>;
    motivation: z.ZodOptional<z.ZodString>;
    psychology: z.ZodOptional<z.ZodObject<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        wound: z.ZodOptional<z.ZodString>;
        innerTrap: z.ZodOptional<z.ZodString>;
        arc: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
    backstory: z.ZodOptional<z.ZodString>;
    visual: z.ZodOptional<z.ZodString>;
    voice: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodRecord<z.ZodString, z.ZodUnknown>]>>;
}, z.ZodTypeAny, "passthrough">>, "many">;
/**
 * Worldbuilding schema (from WorldbuilderAgent)
 */
export declare const WorldbuildingSchema: z.ZodObject<{
    geography: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    timePeriod: z.ZodOptional<z.ZodString>;
    technology: z.ZodOptional<z.ZodString>;
    socialStructures: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    culture: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    economy: z.ZodOptional<z.ZodString>;
    magic: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    history: z.ZodOptional<z.ZodString>;
    sensory: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    geography?: Record<string, unknown> | undefined;
    timePeriod?: string | undefined;
    technology?: string | undefined;
    socialStructures?: Record<string, unknown> | undefined;
    culture?: Record<string, unknown> | undefined;
    economy?: string | undefined;
    magic?: Record<string, unknown> | undefined;
    history?: string | undefined;
    sensory?: Record<string, unknown> | undefined;
}, {
    geography?: Record<string, unknown> | undefined;
    timePeriod?: string | undefined;
    technology?: string | undefined;
    socialStructures?: Record<string, unknown> | undefined;
    culture?: Record<string, unknown> | undefined;
    economy?: string | undefined;
    magic?: Record<string, unknown> | undefined;
    history?: string | undefined;
    sensory?: Record<string, unknown> | undefined;
}>;
/**
 * Outline schema (from StrategistAgent - Outlining phase)
 */
export declare const OutlineSchema: z.ZodObject<{
    scenes: z.ZodArray<z.ZodObject<{
        sceneNumber: z.ZodOptional<z.ZodNumber>;
        title: z.ZodString;
        setting: z.ZodOptional<z.ZodString>;
        characters: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        goal: z.ZodOptional<z.ZodString>;
        conflict: z.ZodOptional<z.ZodString>;
        emotionalBeat: z.ZodOptional<z.ZodString>;
        dialogue: z.ZodOptional<z.ZodString>;
        hook: z.ZodOptional<z.ZodString>;
        wordCount: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        characters?: string[] | undefined;
        sceneNumber?: number | undefined;
        setting?: string | undefined;
        emotionalBeat?: string | undefined;
        wordCount?: number | undefined;
        hook?: string | undefined;
        goal?: string | undefined;
        conflict?: string | undefined;
        dialogue?: string | undefined;
    }, {
        title: string;
        characters?: string[] | undefined;
        sceneNumber?: number | undefined;
        setting?: string | undefined;
        emotionalBeat?: string | undefined;
        wordCount?: number | undefined;
        hook?: string | undefined;
        goal?: string | undefined;
        conflict?: string | undefined;
        dialogue?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    scenes: {
        title: string;
        characters?: string[] | undefined;
        sceneNumber?: number | undefined;
        setting?: string | undefined;
        emotionalBeat?: string | undefined;
        wordCount?: number | undefined;
        hook?: string | undefined;
        goal?: string | undefined;
        conflict?: string | undefined;
        dialogue?: string | undefined;
    }[];
}, {
    scenes: {
        title: string;
        characters?: string[] | undefined;
        sceneNumber?: number | undefined;
        setting?: string | undefined;
        emotionalBeat?: string | undefined;
        wordCount?: number | undefined;
        hook?: string | undefined;
        goal?: string | undefined;
        conflict?: string | undefined;
        dialogue?: string | undefined;
    }[];
}>;
/**
 * Advanced Plan schema (from StrategistAgent - Advanced Planning phase)
 */
export declare const AdvancedPlanSchema: z.ZodObject<{
    motifs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    subtext: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    emotionalBeats: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    sensory: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    contradictions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    deepening: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    complexity: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    sensory?: Record<string, unknown> | undefined;
    motifs?: Record<string, unknown> | undefined;
    subtext?: Record<string, unknown> | undefined;
    emotionalBeats?: Record<string, unknown> | undefined;
    contradictions?: Record<string, unknown> | undefined;
    deepening?: Record<string, unknown> | undefined;
    complexity?: Record<string, unknown> | undefined;
}, {
    sensory?: Record<string, unknown> | undefined;
    motifs?: Record<string, unknown> | undefined;
    subtext?: Record<string, unknown> | undefined;
    emotionalBeats?: Record<string, unknown> | undefined;
    contradictions?: Record<string, unknown> | undefined;
    deepening?: Record<string, unknown> | undefined;
    complexity?: Record<string, unknown> | undefined;
}>;
/**
 * Critique schema (from CriticAgent)
 */
export declare const CritiqueSchema: z.ZodObject<{
    approved: z.ZodOptional<z.ZodBoolean>;
    score: z.ZodOptional<z.ZodNumber>;
    revision_needed: z.ZodOptional<z.ZodBoolean>;
    strengths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    issues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    revisionRequests: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    approved?: boolean | undefined;
    strengths?: string[] | undefined;
    issues?: string[] | undefined;
    score?: number | undefined;
    revision_needed?: boolean | undefined;
    revisionRequests?: string[] | undefined;
}, {
    approved?: boolean | undefined;
    strengths?: string[] | undefined;
    issues?: string[] | undefined;
    score?: number | undefined;
    revision_needed?: boolean | undefined;
    revisionRequests?: string[] | undefined;
}>;
/**
 * Originality Report schema (from OriginalityAgent)
 */
export declare const OriginalityReportSchema: z.ZodObject<{
    originality_score: z.ZodNumber;
    cliches_found: z.ZodArray<z.ZodString, "many">;
    suggestions: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    originality_score: number;
    cliches_found: string[];
    suggestions: string[];
}, {
    originality_score: number;
    cliches_found: string[];
    suggestions: string[];
}>;
/**
 * Impact Report schema (from ImpactAgent)
 */
export declare const ImpactReportSchema: z.ZodObject<{
    impact_score: z.ZodNumber;
    emotional_beats: z.ZodArray<z.ZodString, "many">;
    engagement_level: z.ZodEnum<["high", "medium", "low"]>;
    recommendations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    recommendations: string[];
    impact_score: number;
    emotional_beats: string[];
    engagement_level: "high" | "medium" | "low";
}, {
    recommendations: string[];
    impact_score: number;
    emotional_beats: string[];
    engagement_level: "high" | "medium" | "low";
}>;
/**
 * Archivist Output schema (from ArchivistAgent)
 */
export declare const ArchivistOutputSchema: z.ZodObject<{
    constraints: z.ZodOptional<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodString;
        sceneNumber: z.ZodNumber;
        reasoning: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sceneNumber: number;
        key: string;
        value: string;
        reasoning?: string | undefined;
    }, {
        sceneNumber: number;
        key: string;
        value: string;
        reasoning?: string | undefined;
    }>, "many">>;
    conflicts_resolved: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    discarded_facts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    constraints?: {
        sceneNumber: number;
        key: string;
        value: string;
        reasoning?: string | undefined;
    }[] | undefined;
    conflicts_resolved?: string[] | undefined;
    discarded_facts?: string[] | undefined;
}, {
    constraints?: {
        sceneNumber: number;
        key: string;
        value: string;
        reasoning?: string | undefined;
    }[] | undefined;
    conflicts_resolved?: string[] | undefined;
    discarded_facts?: string[] | undefined;
}>;
/**
 * Validation error class
 */
export declare class ValidationError extends Error {
    readonly zodError: z.ZodError;
    readonly agentType: string;
    constructor(zodError: z.ZodError, agentType: string);
}
//# sourceMappingURL=AgentSchemas.d.ts.map