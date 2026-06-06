/**
 * Slice 2: SpiceRewriter builds the amplify prompt and splices amplified text
 * back into the final scene by exact match (graceful skip if not found).
 */
import { buildAmplifyMessages, spliceAmplified, contextAround } from "../services/SpiceRewriter";

describe("buildAmplifyMessages", () => {
  it("instructs amplify-not-replace and carries style, ceiling, and context", () => {
    const msgs = buildAmplifyMessages({
      fragment: "They moved closer.",
      style: "slow burn to intense",
      ceiling: "explicit, consensual",
      before: "She locked the door.",
      after: "Dawn broke.",
    });
    const joined = msgs.map((m) => m.content).join("\n").toLowerCase();
    expect(joined).toContain("they moved closer");
    expect(joined).toContain("slow burn to intense");
    expect(joined).toContain("explicit, consensual");
    expect(joined).toContain("she locked the door");
    expect(joined).toContain("dawn broke");
    expect(joined).toContain("preserve");
  });
});

describe("spliceAmplified", () => {
  it("replaces the exact fragment with the amplified text", () => {
    const out = spliceAmplified("A. They moved closer. C.", "They moved closer.", "They drew together, breathless.");
    expect(out).toBe("A. They drew together, breathless. C.");
  });

  it("returns the original text unchanged when the fragment is not found", () => {
    const original = "A. Something else entirely. C.";
    const out = spliceAmplified(original, "They moved closer.", "amplified");
    expect(out).toBe(original);
  });

  it("replaces only the first occurrence", () => {
    const out = spliceAmplified("x y x", "x", "Z");
    expect(out).toBe("Z y x");
  });
});

describe("contextAround", () => {
  it("returns trimmed before/after windows around the fragment", () => {
    const full = "AAA. The fragment here. BBB.";
    const { before, after } = contextAround(full, "The fragment here.", 100);
    expect(before).toBe("AAA.");
    expect(after).toBe("BBB.");
  });
  it("returns empty strings when the fragment is not found", () => {
    const { before, after } = contextAround("no match", "xyz", 100);
    expect(before).toBe("");
    expect(after).toBe("");
  });
});
