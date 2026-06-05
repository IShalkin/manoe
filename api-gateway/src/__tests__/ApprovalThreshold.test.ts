/**
 * Slice 1a: isApproved unifies on a single threshold (7) and no longer lets
 * revision_needed===false auto-approve a scene that lacks a qualifying score.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;
function isApproved(critique: AnyObj): boolean {
  const o = new StorytellerOrchestrator() as unknown as AnyObj;
  return (o.isApproved as (c: AnyObj) => boolean)(critique);
}

describe("isApproved unified threshold (7)", () => {
  it("approves a score of 7 with no blocking flag", () => {
    expect(isApproved({ score: 7 })).toBe(true);
  });
  it("rejects a score of 6", () => {
    expect(isApproved({ score: 6 })).toBe(false);
  });
  it("rejects when revision_needed is true even with a high score", () => {
    expect(isApproved({ score: 9, revision_needed: true })).toBe(false);
  });
  it("does NOT auto-approve on revision_needed===false without a qualifying score", () => {
    expect(isApproved({ revision_needed: false })).toBe(false);
  });
  it("honors an explicit approved flag with a qualifying score", () => {
    expect(isApproved({ approved: true, score: 8 })).toBe(true);
  });
});
