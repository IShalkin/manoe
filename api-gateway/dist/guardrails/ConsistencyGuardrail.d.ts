/**
 * Consistency Guardrail
 *
 * Checks that generated content doesn't contradict existing Key Constraints
 * Uses semantic similarity to detect potential conflicts
 */
import { KeyConstraint } from "../models/AgentModels";
/**
 * Guardrail result
 */
export interface GuardrailResult {
    passed: boolean;
    violations: string[];
    severity: "warning" | "error";
}
export declare class ConsistencyGuardrail {
    /**
     * Check content for consistency violations against Key Constraints
     */
    check(content: string, constraints: KeyConstraint[]): Promise<GuardrailResult>;
}
//# sourceMappingURL=ConsistencyGuardrail.d.ts.map