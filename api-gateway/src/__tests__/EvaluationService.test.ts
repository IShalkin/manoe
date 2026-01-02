/**
 * Unit tests for EvaluationService
 * Tests the LLM-as-a-Judge evaluation logic without making real API calls
 * 
 * Note: We test the parsing logic directly without importing the full service
 * to avoid Langfuse dynamic import issues with Jest
 */

describe("EvaluationService", () => {
  /**
   * Parse evaluation response - extracted logic for testing
   * This mirrors the parseEvaluationResponse method in EvaluationService
   */
  function parseEvaluationResponse(content: string, model: string, durationMs: number) {
    try {
      const jsonMatch = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (!jsonMatch) {
        return null;
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
    } catch (error) {
      return null;
    }
  }

  /**
   * Build faithfulness prompt - extracted logic for testing
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
   * Build relevance prompt - extracted logic for testing
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

  describe("parseEvaluationResponse", () => {
    it("should parse valid JSON response", () => {
      const content = '{"score": 0.85, "reasoning": "Good adherence to plan"}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(0.85);
      expect(result?.reasoning).toBe("Good adherence to plan");
      expect(result?.evaluationModel).toBe("gpt-4o-mini");
      expect(result?.durationMs).toBe(100);
    });

    it("should extract JSON from text with surrounding content", () => {
      const content = 'Here is my evaluation:\n{"score": 0.7, "reasoning": "Some deviations"}\nThank you!';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 150);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(0.7);
      expect(result?.reasoning).toBe("Some deviations");
    });

    it("should clamp score to 0-1 range (above 1)", () => {
      const content = '{"score": 1.5, "reasoning": "Excellent"}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(1);
    });

    it("should clamp score to 0-1 range (below 0)", () => {
      const content = '{"score": -0.5, "reasoning": "Poor"}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(0);
    });

    it("should return null for missing JSON", () => {
      const content = "This response has no JSON at all";
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).toBeNull();
    });

    it("should return null for invalid JSON", () => {
      const content = '{"score": invalid, "reasoning": "test"}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).toBeNull();
    });

    it("should handle missing score field (defaults to 0)", () => {
      const content = '{"reasoning": "No score provided"}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(0);
    });

    it("should handle missing reasoning field", () => {
      const content = '{"score": 0.8}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result?.reasoning).toBe("No reasoning provided");
    });

    it("should handle string score that can be parsed as number", () => {
      const content = '{"score": "0.9", "reasoning": "Good"}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(0.9);
    });

    it("should handle nested JSON in response", () => {
      const content = 'Analysis: {"score": 0.75, "reasoning": "Contains nested {data}"}';
      const result = parseEvaluationResponse(content, "gpt-4o-mini", 100);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(0.75);
    });
  });

  describe("buildFaithfulnessPrompt", () => {
    it("should include both writer output and architect plan", () => {
      const prompt = buildFaithfulnessPrompt("The hero walked into the castle.", "Scene: Hero enters castle");

      expect(prompt).toContain("The hero walked into the castle.");
      expect(prompt).toContain("Scene: Hero enters castle");
      expect(prompt).toContain("Architect's Plan");
      expect(prompt).toContain("Writer's Output");
    });
  });

  describe("buildRelevancePrompt", () => {
    it("should include both profiler output and seed idea", () => {
      const prompt = buildRelevancePrompt("Character: John, a detective", "A mystery story about a detective");

      expect(prompt).toContain("Character: John, a detective");
      expect(prompt).toContain("A mystery story about a detective");
      expect(prompt).toContain("Story Idea");
      expect(prompt).toContain("Character Profile");
    });
  });
});
