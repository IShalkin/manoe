import { describe, it, expect } from "@jest/globals";
import {
  SupabaseCharacterSchema,
  SupabaseWorldbuildingSchema,
  SupabaseDraftSchema,
  SupabaseValidationError,
} from "../schemas/SupabaseSchemas";

describe("SupabaseSchemas - Character Schema", () => {
  it("should pass valid character data", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "John Doe",
      archetype: "Hero",
      core_motivation: "Revenge",
      visual_signature: "Scarred face",
    };

    const result = SupabaseCharacterSchema.parse(input);

    expect(result.project_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.name).toBe("John Doe");
    expect(result.archetype).toBe("Hero");
  });

  it("should reject invalid data types", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "John Doe",
      core_motivation: 123, // Should be string
    };

    const result = SupabaseCharacterSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("core_motivation");
    }
  });

  it("should strip extra fields (passthrough mode for LLM compatibility)", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "John Doe",
      extra_field_not_in_schema: "This should be stripped",
    };

    const result = SupabaseCharacterSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("extra_field_not_in_schema");
      expect(result.data.project_id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.data.name).toBe("John Doe");
    }
  });

  it("should enforce field length limits", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "a".repeat(501), // Exceeds max(500)
    };

    const result = SupabaseCharacterSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("name");
    }
  });

  it("should accept optional qdrant_id", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "John Doe",
      qdrant_id: "660e8400-e29b-41d4-a716-446655440000",
    };

    const result = SupabaseCharacterSchema.parse(input);

    expect(result.qdrant_id).toBe("660e8400-e29b-41d4-a716-446655440000");
  });
});

describe("SupabaseSchemas - Worldbuilding Schema", () => {
  it("should pass valid worldbuilding data", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      element_type: "location",
      name: "Castle Eldoria",
      description: "Ancient fortress on eastern coast",
      attributes: { age: "500 years", dangerous: false },
    };

    const result = SupabaseWorldbuildingSchema.parse(input);

    expect(result.project_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.element_type).toBe("location");
    expect(result.name).toBe("Castle Eldoria");
    expect(result.description).toBe("Ancient fortress on eastern coast");
  });

  it("should reject invalid data types", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      element_type: 123, // Should be string
      name: "Castle",
      description: "Ancient fortress",
    };

    const result = SupabaseWorldbuildingSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("element_type");
    }
  });

  it("should enforce field length limits", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      element_type: "location",
      name: "a".repeat(501), // Exceeds max(500)
      description: "Valid description",
    };

    const result = SupabaseWorldbuildingSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("name");
    }
  });
});

describe("SupabaseSchemas - Draft Schema", () => {
  it("should pass valid draft data", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      scene_number: 1,
      narrative_content: "The scene begins with a dark sky...",
      word_count: 1500,
      status: "draft",
    };

    const result = SupabaseDraftSchema.parse(input);

    expect(result.scene_number).toBe(1);
    expect(result.narrative_content).toBe("The scene begins with a dark sky...");
    expect(result.word_count).toBe(1500);
    expect(result.status).toBe("draft");
  });

  it("should reject invalid data types", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      scene_number: "not a number", // Should be number
      narrative_content: "Content",
    };

    const result = SupabaseDraftSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("scene_number");
    }
  });

  it("should enforce field length limits", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      scene_number: 1,
      narrative_content: "Valid content",
      setting_description: "a".repeat(2001), // Exceeds max(2000)
    };

    const result = SupabaseDraftSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("setting_description");
    }
  });

  it("should default status to draft", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      scene_number: 1,
      narrative_content: "Content",
    };

    const result = SupabaseDraftSchema.parse(input);

    expect(result.status).toBe("draft");
  });

  it("should validate status enum", () => {
    const input = {
      project_id: "550e8400-e29b-41d4-a716-446655440000",
      scene_number: 1,
      narrative_content: "Content",
      status: "invalid_status", // Not in enum
    };

    const result = SupabaseDraftSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("status");
    }
  });
});

describe("SupabaseValidationError", () => {
  it("should create error with proper structure", () => {
    const invalidInput = {
      project_id: "not-a-uuid",
      name: "John Doe",
    };
    
    const parseResult = SupabaseCharacterSchema.safeParse(invalidInput);
    
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const error = new SupabaseValidationError(parseResult.error, "saveCharacter", "character");

      expect(error.name).toBe("SupabaseValidationError");
      expect(error.operation).toBe("saveCharacter");
      expect(error.recordType).toBe("character");
      expect(error.zodError).toBe(parseResult.error);
      expect(error.message).toContain("saveCharacter");
      expect(error.message).toContain("character");
    }
  });
});
