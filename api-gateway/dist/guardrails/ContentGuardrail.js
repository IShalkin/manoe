"use strict";
/**
 * Content Guardrail
 *
 * Checks generated content for problematic content (violence, explicit material, etc.)
 * and ensures content adheres to safety guidelines
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentGuardrail = void 0;
const di_1 = require("@tsed/di");
let ContentGuardrail = class ContentGuardrail {
    /**
     * Check content for violations
     */
    async check(content) {
        const violations = [];
        // Simple keyword-based check (in production, use more sophisticated methods)
        const problematicPatterns = [
            { pattern: /\b(kill|murder|death|violence)\b/gi, severity: "warning", message: "Contains potentially violent content" },
            { pattern: /\b(explicit|adult|nsfw)\b/gi, severity: "error", message: "Contains explicit content" },
        ];
        for (const { pattern, severity, message } of problematicPatterns) {
            if (pattern.test(content)) {
                violations.push(message);
                if (severity === "error") {
                    return {
                        passed: false,
                        violations: [message],
                        severity: "error",
                    };
                }
            }
        }
        return {
            passed: violations.length === 0,
            violations,
            severity: violations.length > 0 ? "warning" : "warning",
        };
    }
};
exports.ContentGuardrail = ContentGuardrail;
exports.ContentGuardrail = ContentGuardrail = __decorate([
    (0, di_1.Service)()
], ContentGuardrail);
//# sourceMappingURL=ContentGuardrail.js.map