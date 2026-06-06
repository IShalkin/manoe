/**
 * Slice 2: the spice parser extracts {{SPICE style="..."}}…{{/SPICE}} fragments
 * and returns clean SOFT prose. It must never throw and never leak markup.
 */
import { extractSpiceRegions } from "../services/spiceParser";

describe("extractSpiceRegions", () => {
  it("extracts a single well-formed region and detags the prose", () => {
    const raw = `She closed the door. {{SPICE style="slow burn"}}They moved closer.{{/SPICE}} Morning came.`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(regions).toHaveLength(1);
    expect(regions[0].text).toBe("They moved closer.");
    expect(regions[0].style).toBe("slow burn");
    expect(soft).toBe("She closed the door. They moved closer. Morning came.");
    expect(soft).not.toContain("{{");
  });

  it("extracts multiple regions in order", () => {
    const raw = `{{SPICE style="a"}}one{{/SPICE}} mid {{SPICE style="b"}}two{{/SPICE}}`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(regions.map((r) => r.text)).toEqual(["one", "two"]);
    expect(regions.map((r) => r.style)).toEqual(["a", "b"]);
    expect(soft).toBe("one mid two");
  });

  it("returns zero regions and unchanged prose when there are no tags", () => {
    const { soft, regions } = extractSpiceRegions("Just plain prose.");
    expect(regions).toHaveLength(0);
    expect(soft).toBe("Just plain prose.");
  });

  it("strips an unclosed opening tag without leaking markup (keeps the text)", () => {
    const raw = `Before {{SPICE style="x"}}the rest of the scene with no close`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(soft).not.toContain("{{");
    expect(soft).not.toContain("SPICE");
    expect(soft).toContain("the rest of the scene");
    expect(regions).toHaveLength(0); // unclosed => not a usable region
  });

  it("strips an orphan closing tag", () => {
    const { soft } = extractSpiceRegions("text {{/SPICE}} more");
    expect(soft).not.toContain("{{");
    expect(soft).toContain("text");
    expect(soft).toContain("more");
  });

  it("handles a style-less opening tag (style defaults to empty string)", () => {
    const { regions } = extractSpiceRegions(`{{SPICE}}body{{/SPICE}}`);
    expect(regions).toHaveLength(1);
    expect(regions[0].text).toBe("body");
    expect(regions[0].style).toBe("");
  });

  it("never throws on garbage input", () => {
    expect(() => extractSpiceRegions(`{{SPICE {{ }} /SPICE}} {{SPICE style=}}`)).not.toThrow();
    const { soft } = extractSpiceRegions(`{{SPICE {{ }} /SPICE}} {{SPICE style=}}`);
    expect(soft).not.toContain("{{SPICE");
  });

  it("flattens nested SPICE by taking the outermost region's inner text", () => {
    const raw = `{{SPICE style="outer"}}a {{SPICE style="inner"}}b{{/SPICE}} c{{/SPICE}}`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(soft).not.toContain("{{");
    // At least one usable region; inner markup must not survive in soft text.
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });
});
