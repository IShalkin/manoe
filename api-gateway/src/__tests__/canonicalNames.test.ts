import { buildCanonicalNamesBlock } from "../utils/canonicalNames";

describe("buildCanonicalNamesBlock (real shipped logic)", () => {
  it("returns the no-characters sentence for non-array input", () => {
    expect(buildCanonicalNamesBlock(undefined)).toBe("No characters established yet.");
    expect(buildCanonicalNamesBlock(null)).toBe("No characters established yet.");
    expect(buildCanonicalNamesBlock("nope")).toBe("No characters established yet.");
  });
  it("returns the no-named sentence when no entries carry a name", () => {
    expect(buildCanonicalNamesBlock([{}, { age: 30 }])).toBe("No named characters established yet.");
  });
  it("collects name / fullName / characterName, trimmed, as a bullet list", () => {
    const out = buildCanonicalNamesBlock([
      { name: " Alice " },
      { fullName: "Bob Smith" },
      { characterName: "Carol" },
    ]);
    expect(out).toBe("- Alice\n- Bob Smith\n- Carol");
  });
  it("prefers name over fullName over characterName", () => {
    expect(buildCanonicalNamesBlock([{ name: "A", fullName: "B", characterName: "C" }])).toBe("- A");
  });
});
