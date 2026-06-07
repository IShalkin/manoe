import { wordCount } from "../utils/wordCount";

describe("wordCount (real shipped behavior: split(/\\s+/).length, no empty-filter)", () => {
  it("counts simple words", () => {
    expect(wordCount("one two three")).toBe(3);
  });
  it("collapses runs of whitespace", () => {
    expect(wordCount("one   two    three")).toBe(3);
  });
  it("treats newlines and tabs as separators", () => {
    expect(wordCount("one\ntwo\nthree")).toBe(3);
    expect(wordCount("one\ttwo\tthree")).toBe(3);
  });
  // REAL behavior (NOT the fiction's 0): split(/\s+/) on "" yields [""] => length 1.
  it("returns 1 for an empty string (real split behavior, no filter)", () => {
    expect(wordCount("")).toBe(1);
  });
  // REAL behavior (NOT the fiction's 0): whitespace-only yields ["",""] => length 2.
  it("returns 2 for whitespace-only (leading + trailing empty token)", () => {
    expect(wordCount("   ")).toBe(2);
  });
  it("counts a leading-space string with the leading empty token", () => {
    expect(wordCount(" one two")).toBe(3);
  });
});
