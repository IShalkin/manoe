import { extractStringValue } from "../utils/extractStringValue";

describe("extractStringValue (real shipped logic)", () => {
  it("returns a string as-is", () => {
    expect(extractStringValue("test")).toBe("test");
  });
  it("extracts name from an object", () => {
    expect(extractStringValue({ name: "John" })).toBe("John");
  });
  it("extracts theme from an object", () => {
    expect(extractStringValue({ theme: "coming of age" })).toBe("coming of age");
  });
  it("extracts description from an object", () => {
    expect(extractStringValue({ description: "A story about..." })).toBe("A story about...");
  });
  it("extracts type from an object", () => {
    expect(extractStringValue({ type: "mystery" })).toBe("mystery");
  });
  it("extracts structure from an object", () => {
    expect(extractStringValue({ structure: "three-act" })).toBe("three-act");
  });
  it("prioritizes name over description", () => {
    expect(extractStringValue({ name: "John", description: "A hero" })).toBe("John");
  });
  it("JSON-stringifies objects with no known field", () => {
    expect(extractStringValue({ other: "field" })).toBe('{"other":"field"}');
  });
  it("returns empty string for numbers", () => {
    expect(extractStringValue(42)).toBe("");
  });
  it("returns empty string for null", () => {
    expect(extractStringValue(null)).toBe("");
  });
});
