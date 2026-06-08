import { shouldUseBeatsMethod, calculateBeatsParts, BEATS_THRESHOLD, WORDS_PER_PART } from "../utils/beatsPlanning";

describe("shouldUseBeatsMethod (real threshold 1000)", () => {
  it("exposes the real constants", () => {
    expect(BEATS_THRESHOLD).toBe(1000);
    expect(WORDS_PER_PART).toBe(500);
  });
  it("is false below the threshold", () => {
    expect(shouldUseBeatsMethod(500)).toBe(false);
  });
  it("is false exactly at 1000 (strict greater-than)", () => {
    expect(shouldUseBeatsMethod(1000)).toBe(false);
  });
  it("is true above 1000", () => {
    expect(shouldUseBeatsMethod(1001)).toBe(true);
    expect(shouldUseBeatsMethod(1500)).toBe(true);
  });
});

describe("calculateBeatsParts (real [3,4] clamp)", () => {
  it("clamps small targets up to the minimum of 3", () => {
    expect(calculateBeatsParts(300)).toBe(3);
    expect(calculateBeatsParts(1000)).toBe(3); // ceil(1000/500)=2 -> clamped up to 3
    expect(calculateBeatsParts(1200)).toBe(3); // ceil(1200/500)=3
  });
  it("returns 4 when ceil(target/500) reaches 4", () => {
    expect(calculateBeatsParts(1600)).toBe(4); // ceil(1600/500)=4
    expect(calculateBeatsParts(2000)).toBe(4);
  });
  it("clamps large targets down to the maximum of 4", () => {
    expect(calculateBeatsParts(5000)).toBe(4); // ceil=10 -> clamped to 4
  });
});
