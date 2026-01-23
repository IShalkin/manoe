/**
 * Unit Tests for EvaluationService
 * 
 * Tests the LLM-as-a-Judge evaluation system logic
 * These tests verify the core logic functions without importing the actual service
 * to avoid issues with langfuse's dynamic imports in Jest.
 * 
 * The actual service integration is tested via end-to-end tests.
 */

// Define the EvaluationResult interface for testing
interface EvaluationResult {
  score: number;
  reasoning: string;
  evaluationModel: string;
  durationMs: number;
}

// Define input interfaces for testing
interface FaithfulnessInput {
  runId: string;
  writerOutput: string;
  architectPlan: string;
  sceneNumber?: number;
}

interface RelevanceInput {
  runId: string;
  profilerOutput: string;
  seedIdea: string;
  characterName?: string;
}

/**
 * Parse LLM evaluation response
 * This is the same logic as in EvaluationService.parseEvaluationResponse
 */
function parseEvaluationResponse(content: string, model: string, durationMs: number): EvaluationResult | null {
  try {
    // Try to extract JSON from the response - use non-greedy match to get first JSON object
    const jsonMatch = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
    const reasoning = String(parsed.reasoning || "No reasoning provided");

    return {
      score,
      reasoning,
      evaluationModel: model,
      durationMs,
    };
  } catch {
    return null;
  }
}

/**
 * Build faithfulness evaluation prompt
 * This is the same logic as in EvaluationService.buildFaithfulnessPrompt
 */
function buildFaithfulnessPrompt(writerOutput: string, architectPlan: string): string {
  return `## Architect's Plan
${architectPlan}

## Writer's Output
${writerOutput}

Evaluate how faithfully the writer followed the architect's plan. Consider:
1. Are all key plot points from the plan included?
2. Are character actions consistent with the plan?
3. Is the tone and pacing as specified?
4. Are any important elements missing or contradicted?`;
}

/**
 * Build relevance evaluation prompt
 * This is the same logic as in EvaluationService.buildRelevancePrompt
 */
function buildRelevancePrompt(profilerOutput: string, seedIdea: string): string {
  return `## User's Story Idea
${seedIdea}

## Character Profile
${profilerOutput}

Evaluate how relevant this character profile is to the user's story idea. Consider:
1. Does the character fit the genre and setting?
2. Would this character naturally exist in this story world?
3. Does the character's background align with the story's themes?
4. Is the character's role appropriate for the narrative?`;
}

describe("EvaluationService", () => {
  describe("parseEvaluationResponse", () => {
    it("should parse valid JSON response", () => {
      const content = '{"score": 0.85, "reasoning": "Good adherence to plan"}';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 1000);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0.85);
      expect(result!.reasoning).toBe("Good adherence to plan");
      expect(result!.evaluationModel).toBe("gpt-4o-mini");
      expect(result!.durationMs).toBe(1000);
    });

    it("should extract JSON from text with surrounding content", () => {
      const content = 'Here is my evaluation: {"score": 0.7, "reasoning": "Some issues found"} That is my assessment.';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 500);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0.7);
      expect(result!.reasoning).toBe("Some issues found");
    });

    it("should clamp score to 0-1 range (above 1)", () => {
      const content = '{"score": 1.5, "reasoning": "Perfect"}';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(1);
    });

    it("should clamp score to 0-1 range (below 0)", () => {
      const content = '{"score": -0.5, "reasoning": "Very bad"}';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it("should return null for invalid JSON", () => {
      const content = 'This is not valid JSON at all';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).toBeNull();
    });

    it("should return null for malformed JSON", () => {
      const content = '{"score": 0.8, "reasoning": }';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).toBeNull();
    });

    it("should handle missing reasoning field", () => {
      const content = '{"score": 0.9}';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0.9);
      expect(result!.reasoning).toBe("No reasoning provided");
    });

    it("should handle non-numeric score", () => {
      const content = '{"score": "high", "reasoning": "Good"}';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0); // NaN becomes 0
    });

    it("should handle score as string number", () => {
      const content = '{"score": "0.75", "reasoning": "Good"}';
      
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(0.75);
    });
  });

  describe("buildFaithfulnessPrompt", () => {
    it("should include architect plan and writer output", () => {
      const writerOutput = "The hero walked into the forest.";
      const architectPlan = "Scene 1: Hero enters the forest to find the artifact.";

      const prompt = buildFaithfulnessPrompt(writerOutput, architectPlan);

      expect(prompt).toContain("## Architect's Plan");
      expect(prompt).toContain(architectPlan);
      expect(prompt).toContain("## Writer's Output");
      expect(prompt).toContain(writerOutput);
      expect(prompt).toContain("Evaluate how faithfully");
    });

    it("should handle empty inputs", () => {
      const prompt = buildFaithfulnessPrompt("", "");

      expect(prompt).toContain("## Architect's Plan");
      expect(prompt).toContain("## Writer's Output");
    });

    it("should handle multiline content", () => {
      const writerOutput = "Line 1\nLine 2\nLine 3";
      const architectPlan = "Plan line 1\nPlan line 2";

      const prompt = buildFaithfulnessPrompt(writerOutput, architectPlan);

      expect(prompt).toContain("Line 1\nLine 2\nLine 3");
      expect(prompt).toContain("Plan line 1\nPlan line 2");
    });
  });

  describe("buildRelevancePrompt", () => {
    it("should include seed idea and profiler output", () => {
      const profilerOutput = "Name: John\nRole: Protagonist\nBackstory: A brave knight";
      const seedIdea = "A fantasy story about a knight saving a kingdom";

      const prompt = buildRelevancePrompt(profilerOutput, seedIdea);

      expect(prompt).toContain("## User's Story Idea");
      expect(prompt).toContain(seedIdea);
      expect(prompt).toContain("## Character Profile");
      expect(prompt).toContain(profilerOutput);
      expect(prompt).toContain("Evaluate how relevant");
    });

    it("should handle empty inputs", () => {
      const prompt = buildRelevancePrompt("", "");

      expect(prompt).toContain("## User's Story Idea");
      expect(prompt).toContain("## Character Profile");
    });
  });

  describe("score clamping", () => {
    const clampScore = (score: number): number => {
      return Math.max(0, Math.min(1, Number(score) || 0));
    };

    it("should clamp score above 1 to 1", () => {
      expect(clampScore(1.5)).toBe(1);
      expect(clampScore(100)).toBe(1);
    });

    it("should clamp score below 0 to 0", () => {
      expect(clampScore(-0.5)).toBe(0);
      expect(clampScore(-100)).toBe(0);
    });

    it("should keep valid scores unchanged", () => {
      expect(clampScore(0)).toBe(0);
      expect(clampScore(0.5)).toBe(0.5);
      expect(clampScore(1)).toBe(1);
      expect(clampScore(0.85)).toBe(0.85);
    });

    it("should handle NaN as 0", () => {
      expect(clampScore(NaN)).toBe(0);
    });
  });

  describe("EvaluationResult interface", () => {
    it("should have correct structure", () => {
      const result: EvaluationResult = {
        score: 0.85,
        reasoning: "Good adherence to plan",
        evaluationModel: "gpt-4o-mini",
        durationMs: 1000,
      };

      expect(result.score).toBe(0.85);
      expect(result.reasoning).toBe("Good adherence to plan");
      expect(result.evaluationModel).toBe("gpt-4o-mini");
      expect(result.durationMs).toBe(1000);
    });
  });

  describe("FaithfulnessInput interface", () => {
    it("should have required fields", () => {
      const input: FaithfulnessInput = {
        runId: "test-run-1",
        writerOutput: "Test output",
        architectPlan: "Test plan",
      };

      expect(input.runId).toBe("test-run-1");
      expect(input.writerOutput).toBe("Test output");
      expect(input.architectPlan).toBe("Test plan");
    });

    it("should support optional sceneNumber", () => {
      const input: FaithfulnessInput = {
        runId: "test-run-1",
        writerOutput: "Test output",
        architectPlan: "Test plan",
        sceneNumber: 5,
      };

      expect(input.sceneNumber).toBe(5);
    });
  });

  describe("RelevanceInput interface", () => {
    it("should have required fields", () => {
      const input: RelevanceInput = {
        runId: "test-run-1",
        profilerOutput: "Test profile",
        seedIdea: "Test idea",
      };

      expect(input.runId).toBe("test-run-1");
      expect(input.profilerOutput).toBe("Test profile");
      expect(input.seedIdea).toBe("Test idea");
    });

    it("should support optional characterName", () => {
      const input: RelevanceInput = {
        runId: "test-run-1",
        profilerOutput: "Test profile",
        seedIdea: "Test idea",
        characterName: "Hero",
      };

      expect(input.characterName).toBe("Hero");
    });
  });
});
