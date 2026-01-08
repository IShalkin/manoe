"use strict";
/**
 * String utility functions for data transformation
 *
 * Naming Convention Strategy:
 * - TypeScript code uses camelCase (e.g., sceneNumber, runId, projectId)
 * - Database (Supabase) uses snake_case (e.g., scene_number, run_id, project_id)
 * - These utilities provide bidirectional conversion at API boundaries
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.camelToSnakeCase = camelToSnakeCase;
exports.snakeToCamelCase = snakeToCamelCase;
/**
 * Converts a single camelCase string to snake_case
 * Handles:
 * - Regular camelCase: "firstName" -> "first_name"
 * - Acronyms: "XMLParser" -> "xml_parser", "getUserID" -> "get_user_id"
 * - Leading underscores: "_privateField" -> "_private_field"
 * @param str - The camelCase string to convert
 * @returns The snake_case version of the string
 */
function toSnakeCase(str) {
    // Count and preserve leading underscores
    const leadingUnderscores = str.match(/^_+/)?.[0] || "";
    const rest = str.slice(leadingUnderscores.length);
    if (!rest)
        return str;
    // Handle acronyms and regular camelCase
    // First, insert underscore before sequences of capitals followed by lowercase
    // e.g., "XMLParser" -> "XML_Parser" -> "xml_parser"
    const converted = rest
        // Handle acronym followed by lowercase: "XMLParser" -> "XML_Parser"
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        // Handle lowercase followed by uppercase: "getUser" -> "get_User"
        .replace(/([a-z\d])([A-Z])/g, "$1_$2")
        .toLowerCase();
    return leadingUnderscores + converted;
}
/**
 * Converts a single snake_case string to camelCase
 * Handles:
 * - Regular snake_case: "first_name" -> "firstName"
 * - Leading underscores: "_private_field" -> "_privateField"
 * - Multiple consecutive underscores: "snake__case" -> "snake_Case" (preserves one)
 * @param str - The snake_case string to convert
 * @returns The camelCase version of the string
 */
function toCamelCase(str) {
    // Count and preserve leading underscores
    const leadingUnderscores = str.match(/^_+/)?.[0] || "";
    const rest = str.slice(leadingUnderscores.length);
    if (!rest)
        return str;
    // Convert snake_case to camelCase, preserving multiple consecutive underscores
    const converted = rest.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return leadingUnderscores + converted;
}
/**
 * Recursively converts all keys in an object from camelCase to snake_case
 * @param obj - The object with camelCase keys
 * @returns A new object with snake_case keys
 */
function camelToSnakeCase(obj) {
    if (obj === null || typeof obj !== "object") {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => typeof item === "object" && item !== null
            ? camelToSnakeCase(item)
            : item);
    }
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const snakeKey = toSnakeCase(key);
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            result[snakeKey] = camelToSnakeCase(value);
        }
        else if (Array.isArray(value)) {
            result[snakeKey] = value.map((item) => typeof item === "object" && item !== null
                ? camelToSnakeCase(item)
                : item);
        }
        else {
            result[snakeKey] = value;
        }
    }
    return result;
}
/**
 * Recursively converts all keys in an object from snake_case to camelCase
 * Used when reading data from Supabase to convert to TypeScript conventions
 * @param obj - The object with snake_case keys
 * @returns A new object with camelCase keys
 */
function snakeToCamelCase(obj) {
    if (obj === null || typeof obj !== "object") {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => typeof item === "object" && item !== null
            ? snakeToCamelCase(item)
            : item);
    }
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = toCamelCase(key);
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            result[camelKey] = snakeToCamelCase(value);
        }
        else if (Array.isArray(value)) {
            result[camelKey] = value.map((item) => typeof item === "object" && item !== null
                ? snakeToCamelCase(item)
                : item);
        }
        else {
            result[camelKey] = value;
        }
    }
    return result;
}
//# sourceMappingURL=stringUtils.js.map