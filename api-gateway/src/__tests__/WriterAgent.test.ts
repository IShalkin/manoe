/**
 * WriterAgent tests — exercise the REAL agent, not shadow copies.
 *
 * Deleted fiction (confirmed not in production via grep):
 * - buildConstraintsBlock copy (WRONG format: [IMMUTABLE], no Scene number) — real format in constraintsBlock.test.ts
 * - calculateWordCount (does not exist in WriterAgent) — real wordCount in wordCount.test.ts
 * - validateBeatsMode (does not exist; real inline NaN-guard at WriterAgent.ts:204-206 inside buildUserPrompt;
 *   not isolated without heavy mocking — coverage gap noted, one-line isNaN throw)
 * - buildCanonicalNamesBlock local copy — extracted to canonicalNames.ts, tested in canonicalNames.test.ts
 */

jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {},
  AGENT_PROMPTS: {},
  PHASE_PROMPTS: {},
}));
jest.mock("../services/LLMProviderService", () => ({
  LLMProviderService: class {},
}));
jest.mock("../services/RedisStreamsService", () => ({
  RedisStreamsService: class {},
}));

import { WriterAgent } from "../agents/WriterAgent";

function makeWriter(): WriterAgent {
  // Collaborators are unused by detectPersonaBreak (pure). Cast stubs in.
  return new WriterAgent({} as never, {} as never);
}

describe("WriterAgent.detectPersonaBreak (real public method)", () => {
  const writer = makeWriter();

  it("detects 'which approach would you prefer'", () => {
    expect(writer.detectPersonaBreak("Here are two versions. Which approach would you prefer?")).toBe(true);
  });
  it("detects A) B) C) options", () => {
    expect(writer.detectPersonaBreak("A) The hero fights. B) The hero runs. C) The hero hides.")).toBe(true);
  });
  it("detects 'your guidance'", () => {
    expect(writer.detectPersonaBreak("I need your guidance on how to proceed.")).toBe(true);
  });
  it("detects 'let me know'", () => {
    expect(writer.detectPersonaBreak("Let me know if you want me to continue.")).toBe(true);
  });
  it("detects 'would you like me to'", () => {
    expect(writer.detectPersonaBreak("Would you like me to revise this section?")).toBe(true);
  });
  it("detects 'here is the revised'", () => {
    expect(writer.detectPersonaBreak("Here is the revised version of the scene.")).toBe(true);
  });
  it("detects 'please choose'", () => {
    expect(writer.detectPersonaBreak("Please choose which version you prefer.")).toBe(true);
  });
  it("detects multiple question marks", () => {
    expect(writer.detectPersonaBreak("What do you think?? Should I continue??")).toBe(true);
  });
  it("does NOT flag normal prose", () => {
    expect(writer.detectPersonaBreak("The hero walked through the forest, his sword gleaming in the moonlight. He knew what he had to do.")).toBe(false);
  });
  it("does NOT flag a single question mark in dialogue", () => {
    expect(writer.detectPersonaBreak('"Where are you going?" she asked. "To find the treasure," he replied.')).toBe(false);
  });
  it("does NOT flag 'here is' in narrative context", () => {
    expect(writer.detectPersonaBreak("Here is where the battle took place, centuries ago.")).toBe(false);
  });
});
