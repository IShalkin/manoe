/**
 * Unit Tests for Schema Normalizers
 * 
 * Tests the normalization layer for LLM outputs
 */

import {
  normalizeCharacters,
  normalizeWorldbuilding,
  normalizeNarrative,
  normalizeOutline,
  normalizeCritique,
} from "../utils/schemaNormalizers";

describe("normalizeCharacters", () => {
  describe("array handling", () => {
    it("should return array as-is when already an array", () => {
      const input = [{ name: "Hero", role: "protagonist" }];
      const result = normalizeCharacters(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Hero");
    });

    it("should unwrap characters from { characters: [...] } wrapper", () => {
      const input = {
        characters: [
          { name: "Hero", role: "protagonist" },
          { name: "Villain", role: "antagonist" },
        ],
      };
      const result = normalizeCharacters(input);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Hero");
      expect(result[1].name).toBe("Villain");
    });

    it("should unwrap characters from { data: [...] } wrapper", () => {
      const input = {
        data: [{ name: "Character", role: "supporting" }],
      };
      const result = normalizeCharacters(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Character");
    });

    it("should unwrap characters from { result: [...] } wrapper", () => {
      const input = {
        result: [{ name: "Character", role: "supporting" }],
      };
      const result = normalizeCharacters(input);

      expect(result).toHaveLength(1);
    });

    it("should wrap single object in array", () => {
      const input = { name: "Solo", role: "protagonist" };
      const result = normalizeCharacters(input);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Solo");
    });

    it("should return empty array for null/undefined", () => {
      expect(normalizeCharacters(null)).toEqual([]);
      expect(normalizeCharacters(undefined)).toEqual([]);
    });
  });

  describe("field normalization", () => {
    it("should normalize Name to name", () => {
      const input = [{ Name: "Hero", role: "protagonist" }];
      const result = normalizeCharacters(input);

      expect(result[0].name).toBe("Hero");
    });

    it("should normalize fullName to name", () => {
      const input = [{ fullName: "John Doe", role: "protagonist" }];
      const result = normalizeCharacters(input);

      expect(result[0].name).toBe("John Doe");
    });

    it("should normalize characterName to name", () => {
      const input = [{ characterName: "Jane", role: "supporting" }];
      const result = normalizeCharacters(input);

      expect(result[0].name).toBe("Jane");
    });

    it("should default to Unknown if no name field found", () => {
      const input = [{ role: "protagonist" }];
      const result = normalizeCharacters(input);

      expect(result[0].name).toBe("Unknown");
    });
  });

  describe("role normalization", () => {
    it("should normalize hero to protagonist", () => {
      const input = [{ name: "Hero", role: "hero" }];
      const result = normalizeCharacters(input);

      expect(result[0].role).toBe("protagonist");
    });

    it("should normalize villain to antagonist", () => {
      const input = [{ name: "Villain", role: "villain" }];
      const result = normalizeCharacters(input);

      expect(result[0].role).toBe("antagonist");
    });

    it("should normalize main to protagonist", () => {
      const input = [{ name: "Main", role: "main" }];
      const result = normalizeCharacters(input);

      expect(result[0].role).toBe("protagonist");
    });

    it("should normalize side to supporting", () => {
      const input = [{ name: "Side", role: "side" }];
      const result = normalizeCharacters(input);

      expect(result[0].role).toBe("supporting");
    });

    it("should preserve unknown roles as lowercase", () => {
      const input = [{ name: "Custom", role: "CustomRole" }];
      const result = normalizeCharacters(input);

      expect(result[0].role).toBe("customrole");
    });
  });

  describe("case normalization", () => {
    it("should normalize Psychology to psychology", () => {
      const input = [{ name: "Hero", Psychology: { wound: "trauma" } }];
      const result = normalizeCharacters(input);

      expect(result[0].psychology).toEqual({ wound: "trauma" });
    });

    it("should normalize Backstory to backstory", () => {
      const input = [{ name: "Hero", Backstory: "Long ago..." }];
      const result = normalizeCharacters(input);

      expect(result[0].backstory).toBe("Long ago...");
    });

    it("should normalize Motivation to motivation", () => {
      const input = [{ name: "Hero", Motivation: "Save the world" }];
      const result = normalizeCharacters(input);

      expect(result[0].motivation).toBe("Save the world");
    });
  });
});

describe("normalizeWorldbuilding", () => {
  it("should return object as-is when valid", () => {
    const input = { geography: "Mountains", technology: "Medieval" };
    const result = normalizeWorldbuilding(input);

    expect(result.geography).toBe("Mountains");
    expect(result.technology).toBe("Medieval");
  });

  it("should unwrap from { worldbuilding: {...} } wrapper", () => {
    const input = {
      worldbuilding: { geography: "Desert", culture: "Nomadic" },
    };
    const result = normalizeWorldbuilding(input);

    expect(result.geography).toBe("Desert");
    expect(result.culture).toBe("Nomadic");
  });

  it("should unwrap from { world: {...} } wrapper", () => {
    const input = {
      world: { geography: "Ocean", economy: "Trade" },
    };
    const result = normalizeWorldbuilding(input);

    expect(result.geography).toBe("Ocean");
    expect(result.economy).toBe("Trade");
  });

  it("should unwrap from { data: {...} } wrapper", () => {
    const input = {
      data: { technology: "Steampunk" },
    };
    const result = normalizeWorldbuilding(input);

    expect(result.technology).toBe("Steampunk");
  });

  it("should wrap non-object in { raw: value }", () => {
    const input = "Invalid worldbuilding";
    const result = normalizeWorldbuilding(input);

    expect(result.raw).toBe("Invalid worldbuilding");
  });

  it("should handle null input", () => {
    const result = normalizeWorldbuilding(null);

    expect(result.raw).toBeNull();
  });
});

describe("normalizeNarrative", () => {
  it("should return object as-is when valid", () => {
    const input = { premise: "A story", hook: "Exciting start" };
    const result = normalizeNarrative(input);

    expect(result.premise).toBe("A story");
    expect(result.hook).toBe("Exciting start");
  });

  it("should unwrap from { narrative: {...} } wrapper", () => {
    const input = {
      narrative: { premise: "Epic tale", themes: ["love", "war"] },
    };
    const result = normalizeNarrative(input);

    expect(result.premise).toBe("Epic tale");
    expect(result.themes).toEqual(["love", "war"]);
  });

  it("should unwrap from { genesis: {...} } wrapper", () => {
    const input = {
      genesis: { premise: "Origin story", arc: "Hero's journey" },
    };
    const result = normalizeNarrative(input);

    expect(result.premise).toBe("Origin story");
    expect(result.arc).toBe("Hero's journey");
  });

  it("should normalize Premise to premise", () => {
    const input = { Premise: "Capital P premise" };
    const result = normalizeNarrative(input);

    expect(result.premise).toBe("Capital P premise");
  });

  it("should normalize Hook to hook", () => {
    const input = { Hook: "Capital H hook" };
    const result = normalizeNarrative(input);

    expect(result.hook).toBe("Capital H hook");
  });

  it("should normalize Themes to themes", () => {
    const input = { Themes: ["Theme1", "Theme2"] };
    const result = normalizeNarrative(input);

    expect(result.themes).toEqual(["Theme1", "Theme2"]);
  });
});

describe("normalizeOutline", () => {
  it("should return outline with scenes array", () => {
    const input = {
      scenes: [
        { title: "Scene 1", setting: "Forest" },
        { title: "Scene 2", setting: "Castle" },
      ],
    };
    const result = normalizeOutline(input);

    expect(result.scenes).toHaveLength(2);
    expect((result.scenes as Record<string, unknown>[])[0].title).toBe("Scene 1");
  });

  it("should unwrap from { outline: {...} } wrapper", () => {
    const input = {
      outline: {
        scenes: [{ title: "Wrapped Scene" }],
      },
    };
    const result = normalizeOutline(input);

    expect(result.scenes).toHaveLength(1);
  });

  it("should convert array to { scenes: [...] }", () => {
    const input = [
      { title: "Scene A" },
      { title: "Scene B" },
    ];
    const result = normalizeOutline(input);

    expect(result.scenes).toHaveLength(2);
  });

  it("should add sceneNumber if missing", () => {
    const input = {
      scenes: [{ title: "No Number" }],
    };
    const result = normalizeOutline(input);

    expect((result.scenes as Record<string, unknown>[])[0].sceneNumber).toBe(1);
  });

  it("should normalize scene_number to sceneNumber", () => {
    const input = {
      scenes: [{ title: "Scene", scene_number: 5 }],
    };
    const result = normalizeOutline(input);

    expect((result.scenes as Record<string, unknown>[])[0].sceneNumber).toBe(5);
  });

  it("should normalize Title to title", () => {
    const input = {
      scenes: [{ Title: "Capital Title" }],
    };
    const result = normalizeOutline(input);

    expect((result.scenes as Record<string, unknown>[])[0].title).toBe("Capital Title");
  });

  it("should use name as title fallback", () => {
    const input = {
      scenes: [{ name: "Scene Name" }],
    };
    const result = normalizeOutline(input);

    expect((result.scenes as Record<string, unknown>[])[0].title).toBe("Scene Name");
  });

  it("should default title to Scene N", () => {
    const input = {
      scenes: [{}],
    };
    const result = normalizeOutline(input);

    expect((result.scenes as Record<string, unknown>[])[0].title).toBe("Scene 1");
  });

  it("should return empty scenes for invalid input", () => {
    const result = normalizeOutline(null);

    expect(result.scenes).toEqual([]);
  });
});

describe("normalizeCritique", () => {
  it("should return object as-is when valid", () => {
    const input = { approved: true, score: 8 };
    const result = normalizeCritique(input);

    expect(result.approved).toBe(true);
    expect(result.score).toBe(8);
  });

  it("should unwrap from { critique: {...} } wrapper", () => {
    const input = {
      critique: { approved: false, issues: ["Issue 1"] },
    };
    const result = normalizeCritique(input);

    expect(result.approved).toBe(false);
    expect(result.issues).toEqual(["Issue 1"]);
  });

  it("should unwrap from { feedback: {...} } wrapper", () => {
    const input = {
      feedback: { score: 7, strengths: ["Good pacing"] },
    };
    const result = normalizeCritique(input);

    expect(result.score).toBe(7);
    expect(result.strengths).toEqual(["Good pacing"]);
  });

  it("should normalize revisionNeeded to revision_needed", () => {
    const input = { revisionNeeded: true };
    const result = normalizeCritique(input);

    expect(result.revision_needed).toBe(true);
  });

  it("should normalize revision_requests to revisionRequests", () => {
    const input = { revision_requests: ["Fix dialogue"] };
    const result = normalizeCritique(input);

    expect(result.revisionRequests).toEqual(["Fix dialogue"]);
  });

  it("should return empty object for null input", () => {
    const result = normalizeCritique(null);

    expect(result).toEqual({});
  });
});
