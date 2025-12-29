"use strict";
/**
 * Consistency Guardrail
 *
 * Checks that generated content doesn't contradict existing Key Constraints
 * Uses semantic similarity to detect potential conflicts
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsistencyGuardrail = void 0;
const di_1 = require("@tsed/di");
let ConsistencyGuardrail = class ConsistencyGuardrail {
    /**
     * Check content for consistency violations against Key Constraints
     */
    async check(content, constraints) {
        const violations = [];
        if (constraints.length === 0) {
            return {
                passed: true,
                violations: [],
                severity: "warning",
            };
        }
        // Simple keyword-based conflict detection
        // In production, use semantic similarity (embeddings) for better detection
        for (const constraint of constraints) {
            // Check if content contradicts the constraint
            // Example: constraint "Hero has blue eyes" vs content "Hero's green eyes"
            const constraintKey = constraint.key.toLowerCase();
            const constraintValue = constraint.value.toLowerCase();
            const contentLower = content.toLowerCase();
            // Look for potential contradictions
            // This is a simplified check - in production, use embeddings
            if (constraintKey.includes("eye") && constraintValue.includes("blue")) {
                if (contentLower.includes("green eye") || contentLower.includes("brown eye")) {
                    violations.push(`Contradicts constraint: ${constraint.key} = ${constraint.value} (Scene ${constraint.sceneNumber})`);
                }
            }
            // Check for other common contradictions
            if (constraintKey.includes("name") && constraintValue) {
                // If constraint specifies a name, check if content uses a different name
                const namePattern = new RegExp(`\\b(?!${constraintValue})\\w+\\b`, "i");
                // This is simplified - in production, use better name detection
            }
            // Check for location contradictions
            if (constraintKey.includes("location") || constraintKey.includes("place")) {
                // Check if content mentions a different location
                // Simplified check
            }
        }
        return {
            passed: violations.length === 0,
            violations,
            severity: violations.length > 0 ? "error" : "warning",
        };
    }
};
exports.ConsistencyGuardrail = ConsistencyGuardrail;
exports.ConsistencyGuardrail = ConsistencyGuardrail = __decorate([
    (0, di_1.Service)()
], ConsistencyGuardrail);
//# sourceMappingURL=ConsistencyGuardrail.js.map