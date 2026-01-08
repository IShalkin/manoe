"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const stringUtils_1 = require("../utils/stringUtils");
(0, globals_1.describe)("stringUtils - camelToSnakeCase", () => {
    (0, globals_1.it)("should convert simple camelCase to snake_case", () => {
        const input = { coreMotivation: "Revenge" };
        const expected = { core_motivation: "Revenge" };
        (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle multiple camelCase keys", () => {
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
        (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should preserve non-camelCase keys", () => {
        const input = { name: "John", age: 25 };
        const expected = { name: "John", age: 25 };
        (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle nested objects", () => {
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
        (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should preserve arrays", () => {
        const input = { quirks: ["Brave", "Loyal"] };
        const expected = { quirks: ["Brave", "Loyal"] };
        (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle empty object", () => {
        const input = {};
        const expected = {};
        (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
    });
});
(0, globals_1.describe)("stringUtils - snakeToCamelCase", () => {
    (0, globals_1.it)("should convert simple snake_case to camelCase", () => {
        const input = { core_motivation: "Revenge" };
        const expected = { coreMotivation: "Revenge" };
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle multiple snake_case keys", () => {
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
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should preserve non-snake_case keys", () => {
        const input = { name: "John", age: 25 };
        const expected = { name: "John", age: 25 };
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle nested objects", () => {
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
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should preserve arrays", () => {
        const input = { quirks: ["Brave", "Loyal"] };
        const expected = { quirks: ["Brave", "Loyal"] };
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle arrays of objects", () => {
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
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle empty object", () => {
        const input = {};
        const expected = {};
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
    (0, globals_1.it)("should handle database-style fields", () => {
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
        (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
    });
});
(0, globals_1.describe)("stringUtils - bidirectional conversion", () => {
    (0, globals_1.it)("should round-trip camelCase -> snake_case -> camelCase", () => {
        const original = {
            runId: "abc123",
            projectId: "proj456",
            sceneNumber: 1,
            narrativeContent: "Once upon a time...",
        };
        const snakeCase = (0, stringUtils_1.camelToSnakeCase)(original);
        const backToCamel = (0, stringUtils_1.snakeToCamelCase)(snakeCase);
        (0, globals_1.expect)(backToCamel).toEqual(original);
    });
    (0, globals_1.it)("should round-trip snake_case -> camelCase -> snake_case", () => {
        const original = {
            run_id: "abc123",
            project_id: "proj456",
            scene_number: 1,
            narrative_content: "Once upon a time...",
        };
        const camelCase = (0, stringUtils_1.snakeToCamelCase)(original);
        const backToSnake = (0, stringUtils_1.camelToSnakeCase)(camelCase);
        (0, globals_1.expect)(backToSnake).toEqual(original);
    });
});
(0, globals_1.describe)("stringUtils - edge cases", () => {
    (0, globals_1.describe)("camelToSnakeCase edge cases", () => {
        (0, globals_1.it)("should handle consecutive capitals (acronyms)", () => {
            const input = { getUserID: "123", XMLParser: "parser" };
            const expected = { get_user_id: "123", xml_parser: "parser" };
            (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
        });
        (0, globals_1.it)("should preserve leading underscores", () => {
            const input = { _privateField: "secret", _id: "123" };
            const expected = { _private_field: "secret", _id: "123" };
            (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
        });
        (0, globals_1.it)("should handle numbers adjacent to capitals", () => {
            const input = { base64Encode: "data", md5Hash: "hash" };
            const expected = { base64_encode: "data", md5_hash: "hash" };
            (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
        });
        (0, globals_1.it)("should handle HTTPSConnection style acronyms", () => {
            const input = { HTTPSConnection: "secure" };
            const expected = { https_connection: "secure" };
            (0, globals_1.expect)((0, stringUtils_1.camelToSnakeCase)(input)).toEqual(expected);
        });
    });
    (0, globals_1.describe)("snakeToCamelCase edge cases", () => {
        (0, globals_1.it)("should preserve leading underscores", () => {
            const input = { _private_field: "secret", _id: "123" };
            const expected = { _privateField: "secret", _id: "123" };
            (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
        });
        (0, globals_1.it)("should handle multiple leading underscores", () => {
            const input = { __dunder_method: "special" };
            const expected = { __dunderMethod: "special" };
            (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
        });
        (0, globals_1.it)("should handle multiple consecutive underscores in middle", () => {
            const input = { snake__case: "value" };
            const expected = { snake_Case: "value" };
            (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
        });
        (0, globals_1.it)("should handle trailing underscores", () => {
            const input = { field_: "value", name__: "test" };
            const expected = { field_: "value", name__: "test" };
            (0, globals_1.expect)((0, stringUtils_1.snakeToCamelCase)(input)).toEqual(expected);
        });
    });
    (0, globals_1.describe)("round-trip with edge cases", () => {
        (0, globals_1.it)("should round-trip leading underscores", () => {
            const original = { _privateField: "secret" };
            const snakeCase = (0, stringUtils_1.camelToSnakeCase)(original);
            (0, globals_1.expect)(snakeCase).toEqual({ _private_field: "secret" });
            const backToCamel = (0, stringUtils_1.snakeToCamelCase)(snakeCase);
            (0, globals_1.expect)(backToCamel).toEqual(original);
        });
        (0, globals_1.it)("should round-trip acronyms from snake_case", () => {
            const original = { xml_parser: "parser", https_connection: "secure" };
            const camelCase = (0, stringUtils_1.snakeToCamelCase)(original);
            (0, globals_1.expect)(camelCase).toEqual({ xmlParser: "parser", httpsConnection: "secure" });
            const backToSnake = (0, stringUtils_1.camelToSnakeCase)(camelCase);
            (0, globals_1.expect)(backToSnake).toEqual(original);
        });
    });
});
//# sourceMappingURL=stringUtils.test.js.map