/**
 * Tests for BaseAgent JSON parsing robustness.
 *
 * Focus: the fence-selection bug and the silent-parse-failure bug in
 * BaseAgent.parseJSON / parseJSONArray (see BaseAgent.ts).
 *
 * We test the pure static helper `extractJSON` directly (it has no deps),
 * plus parseJSON/parseJSONArray via a tiny concrete subclass. BaseAgent's
 * heavy collaborators are mocked so importing the module is cheap and safe
 * under ts-jest.
 */

// Mock heavy/transitive deps BEFORE importing BaseAgent so the module loads
// without pulling langfuse's ESM dynamic import or real services.
jest.mock('../services/LangfuseService', () => ({
  LangfuseService: class {},
  AGENT_PROMPTS: {},
  PHASE_PROMPTS: {},
}));
jest.mock('../services/LLMProviderService', () => ({
  LLMProviderService: class {},
}));
jest.mock('../services/RedisStreamsService', () => ({
  RedisStreamsService: class {},
}));

import { BaseAgent } from '../agents/BaseAgent';
import { AgentType } from '../models/AgentModels';
import { AgentContext, AgentOutput, GenerationOptions } from '../agents/types';

// Minimal concrete subclass so we can reach the protected parse helpers.
class TestAgent extends BaseAgent {
  constructor() {
    // Collaborators are unused by the parse helpers; cast mocked stubs in.
    super(
      AgentType.WRITER,
      {} as never,
      {} as never
    );
  }

  async execute(_context: AgentContext, _options: GenerationOptions): Promise<AgentOutput> {
    return { content: {} };
  }

  // Expose protected helpers for testing.
  public callParseJSON(response: string): Record<string, unknown> {
    return this.parseJSON(response);
  }

  public callParseJSONArray(response: string): Record<string, unknown>[] {
    return this.parseJSONArray(response);
  }
}

// Access the pure static helper without instantiation.
const extractJSON = (BaseAgent as unknown as {
  extractJSON(response: string): string | null;
}).extractJSON;

describe('BaseAgent.extractJSON (pure helper)', () => {
  it('prefers the real fenced block when an example fence precedes it', () => {
    const response = [
      'Here is an example of the format you should use:',
      '```json',
      '{"example": true, "name": "PLACEHOLDER"}',
      '```',
      'And here is my actual answer:',
      '```json',
      '{"name": "real-answer", "value": 42}',
      '```',
    ].join('\n');

    const extracted = extractJSON(response);
    expect(extracted).not.toBeNull();
    expect(JSON.parse(extracted as string)).toEqual({ name: 'real-answer', value: 42 });
  });

  it('extracts a single fenced json block', () => {
    const extracted = extractJSON('```json\n{"name": "test"}\n```');
    expect(JSON.parse(extracted as string)).toEqual({ name: 'test' });
  });

  it('extracts a fenced block without the json tag', () => {
    const extracted = extractJSON('```\n{"name": "test"}\n```');
    expect(JSON.parse(extracted as string)).toEqual({ name: 'test' });
  });

  it('returns raw JSON when there is no fence', () => {
    const extracted = extractJSON('{"name": "test", "value": 1}');
    expect(JSON.parse(extracted as string)).toEqual({ name: 'test', value: 1 });
  });

  it('returns null when nothing parseable is present', () => {
    expect(extractJSON('this is not json at all')).toBeNull();
  });

  it('picks the LAST parseable block — known inverse failure: answer-first, example-after', () => {
    // The LAST-block selection is a heuristic. It wins the common case (an
    // example fence precedes the real answer) but it has a documented inverse
    // failure: when the model emits its real ANSWER first and an illustrative
    // EXAMPLE fence afterward, the heuristic returns the EXAMPLE. This test
    // PINS that current behavior so any future change to the heuristic is
    // intentional rather than accidental.
    const response = [
      'My answer:',
      '```json',
      '{"name": "real-answer"}',
      '```',
      'For reference, the format looks like:',
      '```json',
      '{"name": "EXAMPLE-PLACEHOLDER"}',
      '```',
    ].join('\n');

    const extracted = extractJSON(response);
    // Heuristic limitation: it returns the trailing example, not the answer.
    expect(JSON.parse(extracted as string)).toEqual({ name: 'EXAMPLE-PLACEHOLDER' });
  });
});

describe('BaseAgent.parseJSON', () => {
  const agent = new TestAgent();

  it('parses the REAL object when an example fence precedes the answer', () => {
    const response = [
      'Example only:',
      '```json',
      '{"example": true}',
      '```',
      'Answer:',
      '```json',
      '{"protagonist": "Ada", "setting": "Mars"}',
      '```',
    ].join('\n');

    expect(agent.callParseJSON(response)).toEqual({ protagonist: 'Ada', setting: 'Mars' });
  });

  it('parses a single fenced json block', () => {
    expect(agent.callParseJSON('```json\n{"name": "test"}\n```')).toEqual({ name: 'test' });
  });

  it('parses raw JSON with no fence', () => {
    expect(agent.callParseJSON('{"answer": 42}')).toEqual({ answer: 42 });
  });

  it('returns a detectable parse-failure sentinel for malformed JSON', () => {
    const result = agent.callParseJSON('totally not json');
    // Must be unambiguously detectable downstream...
    expect(result.__parseError).toBe(true);
    // ...and preserve the legacy { raw } shape so nothing breaks.
    expect(result.raw).toBe('totally not json');
  });

  it('does not flag a successful parse with __parseError', () => {
    const result = agent.callParseJSON('{"ok": true}');
    expect(result.__parseError).toBeUndefined();
  });
});

describe('BaseAgent.parseJSONArray', () => {
  const agent = new TestAgent();

  it('returns the array when given {characters: [...]}', () => {
    const response = '{"characters": [{"name": "Alice"}, {"name": "Bob"}]}';
    expect(agent.callParseJSONArray(response)).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
  });

  it('returns a root-level array directly', () => {
    expect(agent.callParseJSONArray('[{"id": 1}, {"id": 2}]')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('extracts the characters array even when an example fence precedes it', () => {
    const response = [
      '```json',
      '{"characters": [{"name": "EXAMPLE"}]}',
      '```',
      '```json',
      '{"characters": [{"name": "Real"}]}',
      '```',
    ].join('\n');
    expect(agent.callParseJSONArray(response)).toEqual([{ name: 'Real' }]);
  });

  it('returns an empty array on parse failure instead of leaking the sentinel', () => {
    // Regression: previously parseJSONArray fell through to `[parsed]`, so a
    // parse failure produced `[{ __parseError: true, raw }]` — a fake "character"
    // that leaked to the frontend via ProfilerAgent's catch path. The contract
    // now is: a parse failure yields [] so nothing malformed propagates. The
    // sole caller (ProfilerAgent) validates against CharactersArraySchema
    // (.min(1)), so [] still fails validation cleanly — detectability preserved,
    // no sentinel object downstream.
    const result = agent.callParseJSONArray('this is not json at all');
    expect(result).toEqual([]);
    // Explicitly assert the old leaking shape is gone.
    expect(result).not.toContainEqual(
      expect.objectContaining({ __parseError: true })
    );
  });
});
