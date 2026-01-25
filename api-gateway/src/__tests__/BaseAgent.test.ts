/**
 * Unit Tests for BaseAgent
 *
 * Tests the base agent's core functionality without making actual LLM calls.
 * 
 * DESIGN CHOICE: These tests use local function implementations that mirror
 * BaseAgent logic, rather than importing the actual class. This approach:
 * 
 * 1. Avoids complex dependency injection (LLMProvider, Langfuse, Redis)
 * 2. Enables fast, isolated unit tests without external services
 * 3. Tests the pure logic of helper functions independently
 * 
 * TRADE-OFF: Changes to BaseAgent methods won't automatically break these tests.
 * To ensure production code stays in sync, we recommend:
 * - Running integration tests that use actual BaseAgent instances
 * - Reviewing these tests when modifying BaseAgent helper methods
 * 
 * NOTE: The actual BaseAgent.validateOutput() throws ValidationError,
 * while this test version returns { success, error } for easier assertions.
 */

import { z } from 'zod';

// ============================================================================
// LOCAL IMPLEMENTATIONS (mirrors BaseAgent logic for testability)
// ============================================================================

/**
 * Parse JSON from LLM response
 * Handles markdown code blocks and various JSON formats
 */
function parseJSON(response: string): Record<string, unknown> {
  try {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    return JSON.parse(response);
  } catch {
    return { raw: response };
  }
}

/**
 * Parse JSON array from LLM response
 */
function parseJSONArray(response: string): Record<string, unknown>[] {
  const parsed = parseJSON(response);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed.characters && Array.isArray(parsed.characters)) {
    return parsed.characters as Record<string, unknown>[];
  }
  return [parsed];
}

/**
 * Build constraints block for prompts
 */
function buildConstraintsBlock(
  constraints: { key: string; value: string; sceneNumber: number }[]
): string {
  if (constraints.length === 0) {
    return 'No constraints established yet.';
  }
  return constraints
    .map((c) => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`)
    .join('\n');
}

/**
 * Validate output against Zod schema
 * Returns { success: true, data } or { success: false, error }
 */
function validateOutput<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// TESTS
// ============================================================================

describe('BaseAgent', () => {
  describe('parseJSON', () => {
    it('should parse plain JSON string', () => {
      const response = '{"name": "test", "value": 123}';
      const result = parseJSON(response);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse JSON from markdown code block', () => {
      const response = '```json\n{"name": "test"}\n```';
      const result = parseJSON(response);
      expect(result).toEqual({ name: 'test' });
    });

    it('should parse JSON from code block without json tag', () => {
      const response = '```\n{"name": "test"}\n```';
      const result = parseJSON(response);
      expect(result).toEqual({ name: 'test' });
    });

    it('should handle JSON with surrounding text', () => {
      const response = 'Here is the result: ```json\n{"answer": 42}\n``` Hope that helps!';
      const result = parseJSON(response);
      expect(result).toEqual({ answer: 42 });
    });

    it('should return raw response for invalid JSON', () => {
      const response = 'This is not JSON at all';
      const result = parseJSON(response);
      expect(result).toEqual({ raw: 'This is not JSON at all' });
    });

    it('should handle nested objects', () => {
      const response = '{"outer": {"inner": {"deep": true}}}';
      const result = parseJSON(response);
      expect(result).toEqual({ outer: { inner: { deep: true } } });
    });

    it('should handle arrays at root level', () => {
      const response = '[1, 2, 3]';
      const result = parseJSON(response);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle empty object', () => {
      const response = '{}';
      const result = parseJSON(response);
      expect(result).toEqual({});
    });

    it('should handle JSON with special characters', () => {
      const response = '{"message": "Hello\\nWorld\\t!"}';
      const result = parseJSON(response);
      expect(result).toEqual({ message: 'Hello\nWorld\t!' });
    });

    it('should handle multiline JSON in code block', () => {
      const response = `\`\`\`json
{
  "name": "test",
  "items": [
    "one",
    "two"
  ]
}
\`\`\``;
      const result = parseJSON(response);
      expect(result).toEqual({ name: 'test', items: ['one', 'two'] });
    });
  });

  describe('parseJSONArray', () => {
    it('should parse array response directly', () => {
      const response = '[{"id": 1}, {"id": 2}]';
      const result = parseJSONArray(response);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should extract characters array from object', () => {
      const response = '{"characters": [{"name": "Alice"}, {"name": "Bob"}]}';
      const result = parseJSONArray(response);
      expect(result).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
    });

    it('should wrap single object in array', () => {
      const response = '{"name": "SingleItem"}';
      const result = parseJSONArray(response);
      expect(result).toEqual([{ name: 'SingleItem' }]);
    });

    it('should handle empty array', () => {
      const response = '[]';
      const result = parseJSONArray(response);
      expect(result).toEqual([]);
    });

    it('should handle array in markdown block', () => {
      const response = '```json\n[{"a": 1}, {"b": 2}]\n```';
      const result = parseJSONArray(response);
      expect(result).toEqual([{ a: 1 }, { b: 2 }]);
    });
  });

  describe('buildConstraintsBlock', () => {
    it('should return placeholder for empty constraints', () => {
      const result = buildConstraintsBlock([]);
      expect(result).toBe('No constraints established yet.');
    });

    it('should format single constraint', () => {
      const constraints = [{ key: 'protagonist', value: 'John Doe', sceneNumber: 1 }];
      const result = buildConstraintsBlock(constraints);
      expect(result).toBe('- protagonist: John Doe (Scene 1)');
    });

    it('should format multiple constraints', () => {
      const constraints = [
        { key: 'protagonist', value: 'John Doe', sceneNumber: 1 },
        { key: 'setting', value: 'New York', sceneNumber: 2 },
        { key: 'mood', value: 'tense', sceneNumber: 3 },
      ];
      const result = buildConstraintsBlock(constraints);
      expect(result).toBe(
        '- protagonist: John Doe (Scene 1)\n- setting: New York (Scene 2)\n- mood: tense (Scene 3)'
      );
    });

    it('should handle scene number 0 (seed constraints)', () => {
      const constraints = [{ key: 'genre', value: 'sci-fi', sceneNumber: 0 }];
      const result = buildConstraintsBlock(constraints);
      expect(result).toBe('- genre: sci-fi (Scene 0)');
    });

    it('should preserve value formatting', () => {
      const constraints = [
        { key: 'dialogue', value: 'Character says: "Hello, world!"', sceneNumber: 5 },
      ];
      const result = buildConstraintsBlock(constraints);
      expect(result).toBe('- dialogue: Character says: "Hello, world!" (Scene 5)');
    });
  });

  describe('validateOutput', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number().positive(),
      email: z.string().email().optional(),
    });

    it('should validate correct data successfully', () => {
      const data = { name: 'John', age: 30 };
      const result = validateOutput(data, testSchema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'John', age: 30 });
      }
    });

    it('should validate data with optional field', () => {
      const data = { name: 'John', age: 30, email: 'john@example.com' };
      const result = validateOutput(data, testSchema);
      expect(result.success).toBe(true);
    });

    it('should fail on missing required field', () => {
      const data = { age: 30 };
      const result = validateOutput(data, testSchema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toEqual(['name']);
      }
    });

    it('should fail on invalid type', () => {
      const data = { name: 'John', age: 'thirty' };
      const result = validateOutput(data, testSchema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toEqual(['age']);
      }
    });

    it('should fail on negative age', () => {
      const data = { name: 'John', age: -5 };
      const result = validateOutput(data, testSchema);
      expect(result.success).toBe(false);
    });

    it('should fail on invalid email format', () => {
      const data = { name: 'John', age: 30, email: 'not-an-email' };
      const result = validateOutput(data, testSchema);
      expect(result.success).toBe(false);
    });

    it('should strip extra fields with strict schema', () => {
      const strictSchema = z.object({ name: z.string() }).strict();
      const data = { name: 'John', extra: 'field' };
      const result = validateOutput(data, strictSchema);
      expect(result.success).toBe(false);
    });
  });

  describe('LLM response format detection', () => {
    // These tests verify the logic used to determine response format

    const detectExpectedFormat = (prompt: string): 'array' | 'object' | 'text' => {
      const expectsArray =
        prompt.includes('Output as JSON array') ||
        prompt.includes('Output JSON array') ||
        prompt.includes('Return a JSON array');
      const expectsObject =
        (prompt.includes('Output as JSON') || prompt.includes('Output JSON')) && !expectsArray;

      if (expectsArray) return 'array';
      if (expectsObject) return 'object';
      return 'text';
    };

    it('should detect array format request', () => {
      const prompt = 'Generate characters. Output as JSON array.';
      expect(detectExpectedFormat(prompt)).toBe('array');
    });

    it('should detect object format request', () => {
      const prompt = 'Generate a story outline. Output as JSON.';
      expect(detectExpectedFormat(prompt)).toBe('object');
    });

    it('should detect text format for plain request', () => {
      const prompt = 'Write a scene about a detective.';
      expect(detectExpectedFormat(prompt)).toBe('text');
    });

    it('should prioritize array over object when both present', () => {
      const prompt = 'Output as JSON array of objects';
      expect(detectExpectedFormat(prompt)).toBe('array');
    });
  });

  describe('guardrail result handling', () => {
    interface GuardrailResult {
      passed: boolean;
      violations: string[];
      severity: 'low' | 'medium' | 'high';
    }

    const combineGuardrailResults = (results: GuardrailResult[]): {
      allPassed: boolean;
      totalViolations: string[];
      maxSeverity: 'low' | 'medium' | 'high';
    } => {
      const allPassed = results.every((r) => r.passed);
      const totalViolations = results.flatMap((r) => r.violations);
      const severityOrder = { low: 0, medium: 1, high: 2 };
      const maxSeverity = results.reduce((max, r) => {
        return severityOrder[r.severity] > severityOrder[max] ? r.severity : max;
      }, 'low' as 'low' | 'medium' | 'high');

      return { allPassed, totalViolations, maxSeverity };
    };

    it('should combine passing results', () => {
      const results: GuardrailResult[] = [
        { passed: true, violations: [], severity: 'low' },
        { passed: true, violations: [], severity: 'low' },
      ];
      const combined = combineGuardrailResults(results);
      expect(combined.allPassed).toBe(true);
      expect(combined.totalViolations).toEqual([]);
      expect(combined.maxSeverity).toBe('low');
    });

    it('should combine failing results', () => {
      const results: GuardrailResult[] = [
        { passed: false, violations: ['issue1'], severity: 'medium' },
        { passed: false, violations: ['issue2', 'issue3'], severity: 'high' },
      ];
      const combined = combineGuardrailResults(results);
      expect(combined.allPassed).toBe(false);
      expect(combined.totalViolations).toEqual(['issue1', 'issue2', 'issue3']);
      expect(combined.maxSeverity).toBe('high');
    });

    it('should report not passed if any fail', () => {
      const results: GuardrailResult[] = [
        { passed: true, violations: [], severity: 'low' },
        { passed: false, violations: ['issue'], severity: 'low' },
      ];
      const combined = combineGuardrailResults(results);
      expect(combined.allPassed).toBe(false);
    });

    it('should handle empty results', () => {
      const results: GuardrailResult[] = [];
      const combined = combineGuardrailResults(results);
      expect(combined.allPassed).toBe(true);
      expect(combined.totalViolations).toEqual([]);
    });
  });

  describe('event emission logic', () => {
    type Sentiment = 'neutral' | 'agree' | 'disagree' | 'excited' | 'concerned';
    type DialogueType = 'question' | 'objection' | 'approval' | 'suggestion';

    interface ThoughtEvent {
      agent: string;
      thought: string;
      sentiment: Sentiment;
      targetAgent?: string;
    }

    interface DialogueEvent {
      from: string;
      to: string;
      message: string;
      dialogueType: DialogueType;
    }

    const buildThoughtEvent = (
      agent: string,
      thought: string,
      sentiment: Sentiment = 'neutral',
      targetAgent?: string
    ): ThoughtEvent => ({
      agent,
      thought,
      sentiment,
      targetAgent,
    });

    const buildDialogueEvent = (
      from: string,
      to: string,
      message: string,
      dialogueType: DialogueType = 'suggestion'
    ): DialogueEvent => ({
      from,
      to,
      message,
      dialogueType,
    });

    it('should build thought event with defaults', () => {
      const event = buildThoughtEvent('WRITER', 'Considering character arc');
      expect(event).toEqual({
        agent: 'WRITER',
        thought: 'Considering character arc',
        sentiment: 'neutral',
        targetAgent: undefined,
      });
    });

    it('should build thought event with all fields', () => {
      const event = buildThoughtEvent('CRITIC', 'Disagree with approach', 'disagree', 'WRITER');
      expect(event).toEqual({
        agent: 'CRITIC',
        thought: 'Disagree with approach',
        sentiment: 'disagree',
        targetAgent: 'WRITER',
      });
    });

    it('should build dialogue event with defaults', () => {
      const event = buildDialogueEvent('ARCHITECT', 'WRITER', 'Consider adding tension');
      expect(event).toEqual({
        from: 'ARCHITECT',
        to: 'WRITER',
        message: 'Consider adding tension',
        dialogueType: 'suggestion',
      });
    });

    it('should build dialogue event with custom type', () => {
      const event = buildDialogueEvent('CRITIC', 'WRITER', 'This scene lacks conflict', 'objection');
      expect(event).toEqual({
        from: 'CRITIC',
        to: 'WRITER',
        message: 'This scene lacks conflict',
        dialogueType: 'objection',
      });
    });
  });

  describe('message content truncation', () => {
    const truncateForLog = (content: string, maxLength: number = 200): string => {
      if (content.length <= maxLength) return content;
      return content.substring(0, maxLength) + '...';
    };

    it('should not truncate short content', () => {
      const content = 'Short message';
      expect(truncateForLog(content)).toBe('Short message');
    });

    it('should truncate long content', () => {
      const content = 'A'.repeat(300);
      const result = truncateForLog(content);
      expect(result.length).toBe(203); // 200 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle exact boundary', () => {
      const content = 'A'.repeat(200);
      expect(truncateForLog(content)).toBe(content);
    });

    it('should respect custom max length', () => {
      const content = 'A'.repeat(100);
      const result = truncateForLog(content, 50);
      expect(result.length).toBe(53);
    });
  });
});
