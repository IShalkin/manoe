import { resolveCorsOrigin } from "../utils/corsConfig";

describe("resolveCorsOrigin (real shipped CORS policy)", () => {
  it("returns wildcard passthrough when CORS_ORIGIN is '*'", () => {
    expect(resolveCorsOrigin("*", "https://anything.example")).toEqual({ allow: "*" });
    expect(resolveCorsOrigin("*", undefined)).toEqual({ allow: "*" });
  });

  it("echoes a whitelisted origin (single exact value, never comma-joined)", () => {
    const env = "https://manoe.iliashalkin.com,https://api.iliashalkin.com";
    expect(resolveCorsOrigin(env, "https://manoe.iliashalkin.com")).toEqual({
      allow: "https://manoe.iliashalkin.com",
    });
  });

  it("trims whitespace around comma-separated entries", () => {
    const env = "https://a.example , https://b.example";
    expect(resolveCorsOrigin(env, "https://b.example")).toEqual({ allow: "https://b.example" });
  });

  it("returns the first whitelist entry when there is no Origin header", () => {
    const env = "https://a.example,https://b.example";
    expect(resolveCorsOrigin(env, undefined)).toEqual({ allow: "https://a.example" });
  });

  it("rejects an origin not in the whitelist", () => {
    const env = "https://a.example";
    const result = resolveCorsOrigin(env, "https://evil.example");
    expect(result.allow).toBeNull();
    expect(result.error).toBe("Origin https://evil.example not allowed by CORS");
  });
});
