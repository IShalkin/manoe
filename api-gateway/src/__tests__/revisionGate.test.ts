import { isRevisionNeeded, calculateWordCountCompliance } from "../utils/revisionGate";

describe("isRevisionNeeded (real shipped logic)", () => {
  it("requires revision when word count is non-compliant, even with a high score", () => {
    expect(isRevisionNeeded({ score: 9, wordCountCompliance: false, approved: true })).toBe(true);
  });

  it("requires revision when scope adherence fails", () => {
    expect(isRevisionNeeded({ score: 9, scopeAdherence: false })).toBe(true);
  });

  it("requires revision for any score below 7", () => {
    expect(isRevisionNeeded({ score: 6 })).toBe(true);
  });

  it("requires revision for score 7 with issues", () => {
    expect(isRevisionNeeded({ score: 7, issues: ["weak ending"] })).toBe(true);
  });

  it("requires revision when issues or revisionRequests exist despite a high score", () => {
    expect(isRevisionNeeded({ score: 9, issues: ["x"] })).toBe(true);
    expect(isRevisionNeeded({ score: 9, revisionRequests: ["y"] })).toBe(true);
  });

  it("approves a clean, explicitly-approved, high-scoring critique", () => {
    expect(isRevisionNeeded({ score: 9, approved: true })).toBe(false);
  });

  it("approves a high score with no issues even without an approved flag", () => {
    expect(isRevisionNeeded({ score: 8 })).toBe(false);
  });

  it("defaults to revision when the score is missing/ambiguous", () => {
    expect(isRevisionNeeded({})).toBe(true);
  });
});

describe("calculateWordCountCompliance (real shipped logic)", () => {
  it("is compliant at exactly 70% of target", () => {
    expect(calculateWordCountCompliance(700, 1000)).toEqual({ compliant: true, ratio: 0.7 });
  });

  it("is non-compliant below 70%", () => {
    expect(calculateWordCountCompliance(699, 1000).compliant).toBe(false);
  });

  it("is compliant when over target", () => {
    expect(calculateWordCountCompliance(1200, 1000).compliant).toBe(true);
  });
});
