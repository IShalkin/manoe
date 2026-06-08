import { median } from "../utils/median";

describe("median", () => {
  it("returns the middle of an odd-length set", () => {
    expect(median([0.2, 0.9, 0.5])).toBe(0.5);
  });
  it("averages the two central values for an even-length set", () => {
    expect(median([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(0.5);
  });
  it("handles a single value", () => {
    expect(median([0.7])).toBe(0.7);
  });
  it("throws on empty", () => {
    expect(() => median([])).toThrow();
  });
});
