import { describe, it, expect } from "@jest/globals";
import { camelToSnakeCase } from "../utils/stringUtils";

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
