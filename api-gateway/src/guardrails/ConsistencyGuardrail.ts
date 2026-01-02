/**
 * Consistency Guardrail
 * 
 * Checks that generated content doesn't contradict existing Key Constraints
 * Uses both keyword-based and semantic similarity (vector embeddings) to detect conflicts
 * 
 * The guardrail operates in two modes:
 * 1. Keyword-based: Fast check against KeyConstraints for known contradiction patterns
 * 2. Semantic: Vector embedding similarity search against World Bible for deeper analysis
 */

import { Service, Inject } from "@tsed/di";
import { KeyConstraint } from "../models/AgentModels";
import { 
  WorldBibleEmbeddingService, 
  ConsistencyCheckResult,
  SemanticSearchResult 
} from "../services/WorldBibleEmbeddingService";

/**
 * Guardrail result
 */
export interface GuardrailResult {
  passed: boolean;
  violations: string[];
  severity: "warning" | "error";
  semanticCheck?: {
    hasContradiction: boolean;
    contradictionScore: number;
    conflictingSections: Array<{
      sectionType: string;
      content: string;
      score: number;
    }>;
  };
}

/**
 * Options for consistency check
 */
export interface ConsistencyCheckOptions {
  enableSemanticCheck?: boolean;
  semanticThreshold?: number;
  projectId?: string;
}

@Service()
export class ConsistencyGuardrail {
  @Inject()
  private worldBibleService!: WorldBibleEmbeddingService;

  /**
   * Default semantic similarity threshold
   * Sections with similarity > threshold are flagged as potential contradictions
   */
  private readonly DEFAULT_SEMANTIC_THRESHOLD = 0.7;

  /**
   * Check content for consistency violations against Key Constraints
   * Combines keyword-based and optional semantic (vector embedding) checks
   * 
   * @param content - The content to check for consistency
   * @param constraints - Key constraints to check against
   * @param options - Optional settings for the check
   */
  async check(
    content: string, 
    constraints: KeyConstraint[],
    options: ConsistencyCheckOptions = {}
  ): Promise<GuardrailResult> {
    const violations: string[] = [];
    let semanticCheckResult: ConsistencyCheckResult | undefined;

    // Keyword-based check against KeyConstraints
    if (constraints.length > 0) {
      const keywordViolations = this.checkKeywordConstraints(content, constraints);
      violations.push(...keywordViolations);
    }

    // Semantic check against World Bible (if enabled and projectId provided)
    if (options.enableSemanticCheck && options.projectId && this.worldBibleService.connected) {
      try {
        semanticCheckResult = await this.worldBibleService.checkSemanticConsistency(
          options.projectId,
          content,
          options.semanticThreshold ?? this.DEFAULT_SEMANTIC_THRESHOLD
        );

        if (semanticCheckResult.hasContradiction) {
          for (const section of semanticCheckResult.conflictingSections) {
            violations.push(
              `Potential contradiction with World Bible (${section.payload.sectionType}): ` +
              `Similarity score ${(section.score * 100).toFixed(1)}% - "${section.payload.content.substring(0, 100)}..."`
            );
          }
        }
      } catch (error) {
        console.warn("ConsistencyGuardrail: Semantic check failed:", error);
      }
    }

    const result: GuardrailResult = {
      passed: violations.length === 0,
      violations,
      severity: violations.length > 0 ? "error" : "warning",
    };

    // Include semantic check details if performed
    if (semanticCheckResult) {
      result.semanticCheck = {
        hasContradiction: semanticCheckResult.hasContradiction,
        contradictionScore: semanticCheckResult.contradictionScore,
        conflictingSections: semanticCheckResult.conflictingSections.map(
          (s: SemanticSearchResult) => ({
            sectionType: s.payload.sectionType,
            content: s.payload.content,
            score: s.score,
          })
        ),
      };
    }

    return result;
  }

  /**
   * Perform semantic-only consistency check against World Bible
   * Use this for deep analysis without KeyConstraint checks
   * 
   * @param projectId - Project ID for World Bible lookup
   * @param content - Content to check
   * @param threshold - Similarity threshold (default: 0.7)
   */
  async checkSemanticConsistency(
    projectId: string,
    content: string,
    threshold: number = this.DEFAULT_SEMANTIC_THRESHOLD
  ): Promise<GuardrailResult> {
    if (!this.worldBibleService.connected) {
      return {
        passed: true,
        violations: [],
        severity: "warning",
      };
    }

    const semanticResult = await this.worldBibleService.checkSemanticConsistency(
      projectId,
      content,
      threshold
    );

    const violations: string[] = [];
    if (semanticResult.hasContradiction) {
      for (const section of semanticResult.conflictingSections) {
        violations.push(
          `Potential contradiction with World Bible (${section.payload.sectionType}): ` +
          `Similarity score ${(section.score * 100).toFixed(1)}%`
        );
      }
    }

    return {
      passed: !semanticResult.hasContradiction,
      violations,
      severity: semanticResult.hasContradiction ? "error" : "warning",
      semanticCheck: {
        hasContradiction: semanticResult.hasContradiction,
        contradictionScore: semanticResult.contradictionScore,
        conflictingSections: semanticResult.conflictingSections.map(
          (s: SemanticSearchResult) => ({
            sectionType: s.payload.sectionType,
            content: s.payload.content,
            score: s.score,
          })
        ),
      },
    };
  }

  /**
   * Keyword-based constraint checking
   * Fast check for known contradiction patterns
   */
  private checkKeywordConstraints(content: string, constraints: KeyConstraint[]): string[] {
    const violations: string[] = [];
    const contentLower = content.toLowerCase();

    for (const constraint of constraints) {
      const constraintKey = constraint.key.toLowerCase();
      const constraintValue = constraint.value.toLowerCase();

      // Check for eye color contradictions
      if (constraintKey.includes("eye") && constraintValue.includes("blue")) {
        if (contentLower.includes("green eye") || contentLower.includes("brown eye")) {
          violations.push(
            `Contradicts constraint: ${constraint.key} = ${constraint.value} (Scene ${constraint.sceneNumber})`
          );
        }
      }

      // Check for hair color contradictions
      if (constraintKey.includes("hair")) {
        const hairColors = ["blonde", "brunette", "black", "red", "brown", "gray", "white"];
        const constraintColor = hairColors.find(c => constraintValue.includes(c));
        if (constraintColor) {
          const otherColors = hairColors.filter(c => c !== constraintColor);
          for (const color of otherColors) {
            if (contentLower.includes(`${color} hair`)) {
              violations.push(
                `Contradicts constraint: ${constraint.key} = ${constraint.value} (Scene ${constraint.sceneNumber})`
              );
              break;
            }
          }
        }
      }

      // Check for status contradictions (alive/dead)
      if (constraintKey.includes("status") || constraintKey.includes("alive") || constraintKey.includes("dead")) {
        if (constraintValue.includes("dead") && contentLower.includes("alive")) {
          violations.push(
            `Contradicts constraint: ${constraint.key} = ${constraint.value} (Scene ${constraint.sceneNumber})`
          );
        }
        if (constraintValue.includes("alive") && (contentLower.includes("died") || contentLower.includes("dead"))) {
          violations.push(
            `Contradicts constraint: ${constraint.key} = ${constraint.value} (Scene ${constraint.sceneNumber})`
          );
        }
      }

      // Check for location contradictions
      if (constraintKey.includes("location") || constraintKey.includes("place")) {
        // Extract location name from constraint
        const locationMatch = constraintValue.match(/(?:in|at|near)\s+(\w+)/i);
        if (locationMatch) {
          const expectedLocation = locationMatch[1].toLowerCase();
          // Check if content mentions being in a different location
          const contentLocationMatch = contentLower.match(/(?:in|at|near)\s+(\w+)/i);
          if (contentLocationMatch && contentLocationMatch[1] !== expectedLocation) {
            // Only flag if the constraint is about current location
            if (constraintKey.includes("current") || constraintKey.includes("now")) {
              violations.push(
                `Potential location contradiction: ${constraint.key} = ${constraint.value} (Scene ${constraint.sceneNumber})`
              );
            }
          }
        }
      }
    }

    return violations;
  }
}

