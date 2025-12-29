/**
 * Content Guardrail
 *
 * Checks generated content for problematic content (violence, explicit material, etc.)
 * and ensures content adheres to safety guidelines
 */
/**
 * Guardrail result
 */
export interface GuardrailResult {
    passed: boolean;
    violations: string[];
    severity: "warning" | "error";
}
export declare class ContentGuardrail {
    /**
     * Check content for violations
     */
    check(content: string): Promise<GuardrailResult>;
}
//# sourceMappingURL=ContentGuardrail.d.ts.map