"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const SupabaseSchemas_1 = require("../schemas/SupabaseSchemas");
(0, globals_1.describe)("SupabaseSchemas - Character Schema", () => {
    (0, globals_1.it)("should pass valid character data", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "John Doe",
            archetype: "Hero",
            core_motivation: "Revenge",
            visual_signature: "Scarred face",
        };
        const result = SupabaseSchemas_1.SupabaseCharacterSchema.parse(input);
        (0, globals_1.expect)(result.project_id).toBe("550e8400-e29b-41d4-a716-446655440000");
        (0, globals_1.expect)(result.name).toBe("John Doe");
        (0, globals_1.expect)(result.archetype).toBe("Hero");
    });
    (0, globals_1.it)("should reject invalid data types", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "John Doe",
            core_motivation: 123, // Should be string
        };
        const result = SupabaseSchemas_1.SupabaseCharacterSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(false);
        if (!result.success) {
            (0, globals_1.expect)(result.error.errors[0].path).toContain("core_motivation");
        }
    });
    (0, globals_1.it)("should strip extra fields (passthrough mode for LLM compatibility)", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "John Doe",
            extra_field_not_in_schema: "This should be stripped",
        };
        const result = SupabaseSchemas_1.SupabaseCharacterSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(true);
        if (result.success) {
            (0, globals_1.expect)(result.data).not.toHaveProperty("extra_field_not_in_schema");
            (0, globals_1.expect)(result.data.project_id).toBe("550e8400-e29b-41d4-a716-446655440000");
            (0, globals_1.expect)(result.data.name).toBe("John Doe");
        }
    });
    (0, globals_1.it)("should enforce field length limits", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "a".repeat(501), // Exceeds max(500)
        };
        const result = SupabaseSchemas_1.SupabaseCharacterSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(false);
        if (!result.success) {
            (0, globals_1.expect)(result.error.errors[0].path).toContain("name");
        }
    });
    (0, globals_1.it)("should accept optional qdrant_id", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "John Doe",
            qdrant_id: "660e8400-e29b-41d4-a716-446655440000",
        };
        const result = SupabaseSchemas_1.SupabaseCharacterSchema.parse(input);
        (0, globals_1.expect)(result.qdrant_id).toBe("660e8400-e29b-41d4-a716-446655440000");
    });
});
(0, globals_1.describe)("SupabaseSchemas - Worldbuilding Schema", () => {
    (0, globals_1.it)("should pass valid worldbuilding data", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            element_type: "location",
            name: "Castle Eldoria",
            description: "Ancient fortress on eastern coast",
            attributes: { age: "500 years", dangerous: false },
        };
        const result = SupabaseSchemas_1.SupabaseWorldbuildingSchema.parse(input);
        (0, globals_1.expect)(result.project_id).toBe("550e8400-e29b-41d4-a716-446655440000");
        (0, globals_1.expect)(result.element_type).toBe("location");
        (0, globals_1.expect)(result.name).toBe("Castle Eldoria");
        (0, globals_1.expect)(result.description).toBe("Ancient fortress on eastern coast");
    });
    (0, globals_1.it)("should reject invalid data types", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            element_type: 123, // Should be string
            name: "Castle",
            description: "Ancient fortress",
        };
        const result = SupabaseSchemas_1.SupabaseWorldbuildingSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(false);
        if (!result.success) {
            (0, globals_1.expect)(result.error.errors[0].path).toContain("element_type");
        }
    });
    (0, globals_1.it)("should enforce field length limits", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            element_type: "location",
            name: "a".repeat(501), // Exceeds max(500)
            description: "Valid description",
        };
        const result = SupabaseSchemas_1.SupabaseWorldbuildingSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(false);
        if (!result.success) {
            (0, globals_1.expect)(result.error.errors[0].path).toContain("name");
        }
    });
});
(0, globals_1.describe)("SupabaseSchemas - Draft Schema", () => {
    (0, globals_1.it)("should pass valid draft data", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            scene_number: 1,
            narrative_content: "The scene begins with a dark sky...",
            word_count: 1500,
            status: "draft",
        };
        const result = SupabaseSchemas_1.SupabaseDraftSchema.parse(input);
        (0, globals_1.expect)(result.scene_number).toBe(1);
        (0, globals_1.expect)(result.narrative_content).toBe("The scene begins with a dark sky...");
        (0, globals_1.expect)(result.word_count).toBe(1500);
        (0, globals_1.expect)(result.status).toBe("draft");
    });
    (0, globals_1.it)("should reject invalid data types", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            scene_number: "not a number", // Should be number
            narrative_content: "Content",
        };
        const result = SupabaseSchemas_1.SupabaseDraftSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(false);
        if (!result.success) {
            (0, globals_1.expect)(result.error.errors[0].path).toContain("scene_number");
        }
    });
    (0, globals_1.it)("should enforce field length limits", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            scene_number: 1,
            narrative_content: "Valid content",
            setting_description: "a".repeat(2001), // Exceeds max(2000)
        };
        const result = SupabaseSchemas_1.SupabaseDraftSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(false);
        if (!result.success) {
            (0, globals_1.expect)(result.error.errors[0].path).toContain("setting_description");
        }
    });
    (0, globals_1.it)("should default status to draft", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            scene_number: 1,
            narrative_content: "Content",
        };
        const result = SupabaseSchemas_1.SupabaseDraftSchema.parse(input);
        (0, globals_1.expect)(result.status).toBe("draft");
    });
    (0, globals_1.it)("should validate status enum", () => {
        const input = {
            project_id: "550e8400-e29b-41d4-a716-446655440000",
            scene_number: 1,
            narrative_content: "Content",
            status: "invalid_status", // Not in enum
        };
        const result = SupabaseSchemas_1.SupabaseDraftSchema.safeParse(input);
        (0, globals_1.expect)(result.success).toBe(false);
        if (!result.success) {
            (0, globals_1.expect)(result.error.errors[0].path).toContain("status");
        }
    });
});
(0, globals_1.describe)("SupabaseValidationError", () => {
    (0, globals_1.it)("should create error with proper structure", () => {
        const invalidInput = {
            project_id: "not-a-uuid",
            name: "John Doe",
        };
        const parseResult = SupabaseSchemas_1.SupabaseCharacterSchema.safeParse(invalidInput);
        (0, globals_1.expect)(parseResult.success).toBe(false);
        if (!parseResult.success) {
            const error = new SupabaseSchemas_1.SupabaseValidationError(parseResult.error, "saveCharacter", "character");
            (0, globals_1.expect)(error.name).toBe("SupabaseValidationError");
            (0, globals_1.expect)(error.operation).toBe("saveCharacter");
            (0, globals_1.expect)(error.recordType).toBe("character");
            (0, globals_1.expect)(error.zodError).toBe(parseResult.error);
            (0, globals_1.expect)(error.message).toContain("saveCharacter");
            (0, globals_1.expect)(error.message).toContain("character");
        }
    });
});
//# sourceMappingURL=SupabaseSchemas.test.js.map