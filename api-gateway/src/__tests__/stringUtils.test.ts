import { describe, it, expect } from "@jest/globals";
import { camelToSnakeCase, snakeToCamelCase } from "../utils/stringUtils";

describe("stringUtils - camelToSnakeCase", () => {
  it("should convert simple camelCase to snake_case", () => {
    const input = { coreMotivation: "Revenge" };
    const expected = { core_motivation: "Revenge" };
    expect(camelToSnakeCase(input)).toEqual(expected);
  });

  it("should handle multiple camelCase keys", () => {
    const input = {
      coreMotivation: "Revenge",
      psychologicalWound: "Parent's death",
      visualSignature: "Scarred face",
    };
    const expected = {
      core_motivation: "Revenge",
      psychological_wound: "Parent's death",
      visual_signature: "Scarred face",
    };
    expect(camelToSnakeCase(input)).toEqual(expected);
  });

  it("should preserve non-camelCase keys", () => {
    const input = { name: "John", age: 25 };
    const expected = { name: "John", age: 25 };
    expect(camelToSnakeCase(input)).toEqual(expected);
  });

  it("should handle nested objects", () => {
    const input = {
      character: {
        firstName: "John",
        lastName: "Doe",
      },
    };
    const expected = {
      character: {
        first_name: "John",
        last_name: "Doe",
      },
    };
    expect(camelToSnakeCase(input)).toEqual(expected);
  });

  it("should preserve arrays", () => {
    const input = { quirks: ["Brave", "Loyal"] };
    const expected = { quirks: ["Brave", "Loyal"] };
    expect(camelToSnakeCase(input)).toEqual(expected);
  });

  it("should handle empty object", () => {
    const input = {};
    const expected = {};
    expect(camelToSnakeCase(input)).toEqual(expected);
  });
});

describe("stringUtils - snakeToCamelCase", () => {
  it("should convert simple snake_case to camelCase", () => {
    const input = { core_motivation: "Revenge" };
    const expected = { coreMotivation: "Revenge" };
    expect(snakeToCamelCase(input)).toEqual(expected);
  });

  it("should handle multiple snake_case keys", () => {
    const input = {
      core_motivation: "Revenge",
      psychological_wound: "Parent's death",
      visual_signature: "Scarred face",
    };
    const expected = {
      coreMotivation: "Revenge",
      psychologicalWound: "Parent's death",
      visualSignature: "Scarred face",
    };
    expect(snakeToCamelCase(input)).toEqual(expected);
  });

  it("should preserve non-snake_case keys", () => {
    const input = { name: "John", age: 25 };
    const expected = { name: "John", age: 25 };
    expect(snakeToCamelCase(input)).toEqual(expected);
  });

  it("should handle nested objects", () => {
    const input = {
      character: {
        first_name: "John",
        last_name: "Doe",
      },
    };
    const expected = {
      character: {
        firstName: "John",
        lastName: "Doe",
      },
    };
    expect(snakeToCamelCase(input)).toEqual(expected);
  });

  it("should preserve arrays", () => {
    const input = { quirks: ["Brave", "Loyal"] };
    const expected = { quirks: ["Brave", "Loyal"] };
    expect(snakeToCamelCase(input)).toEqual(expected);
  });

  it("should handle arrays of objects", () => {
    const input = {
      characters: [
        { first_name: "John", last_name: "Doe" },
        { first_name: "Jane", last_name: "Smith" },
      ],
    };
    const expected = {
      characters: [
        { firstName: "John", lastName: "Doe" },
        { firstName: "Jane", lastName: "Smith" },
      ],
    };
    expect(snakeToCamelCase(input)).toEqual(expected);
  });

  it("should handle empty object", () => {
    const input = {};
    const expected = {};
    expect(snakeToCamelCase(input)).toEqual(expected);
  });

  it("should handle database-style fields", () => {
    const input = {
      run_id: "abc123",
      project_id: "proj456",
      scene_number: 1,
      created_at: "2024-01-01T00:00:00Z",
    };
    const expected = {
      runId: "abc123",
      projectId: "proj456",
      sceneNumber: 1,
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(snakeToCamelCase(input)).toEqual(expected);
  });
});

describe("stringUtils - bidirectional conversion", () => {
  it("should round-trip camelCase -> snake_case -> camelCase", () => {
    const original = {
      runId: "abc123",
      projectId: "proj456",
      sceneNumber: 1,
      narrativeContent: "Once upon a time...",
    };
    const snakeCase = camelToSnakeCase(original);
    const backToCamel = snakeToCamelCase(snakeCase as Record<string, unknown>);
    expect(backToCamel).toEqual(original);
  });

  it("should round-trip snake_case -> camelCase -> snake_case", () => {
    const original = {
      run_id: "abc123",
      project_id: "proj456",
      scene_number: 1,
      narrative_content: "Once upon a time...",
    };
    const camelCase = snakeToCamelCase(original);
    const backToSnake = camelToSnakeCase(camelCase as Record<string, unknown>);
    expect(backToSnake).toEqual(original);
  });
});
