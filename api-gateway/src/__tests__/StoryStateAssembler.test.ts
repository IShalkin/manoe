/**
 * Slice 2: StoryStateAssembler builds typed StoryBible + SceneContract views
 * from existing GenerationState regions, with safe defaults for missing data.
 */
import { assembleStoryBible, assembleSceneContract } from "../services/StoryStateAssembler";

type AnyObj = Record<string, unknown>;

describe("assembleStoryBible", () => {
  it("derives premise/themes/roster/worldRules/voice from state regions", () => {
    const state = {
      narrative: { premise: "A girl flees a cursed city.", themes: ["guilt", "freedom"], genre: "dark fantasy" },
      characters: [{ name: "Mara", role: "lead" }, { name: "Vex", role: "foe" }],
      worldbuilding: { rules: ["Magic costs memory."] },
      narratorVoice: { perspective: "3rd-limited", tone: "melancholy" },
    } as unknown as AnyObj;
    const bible = assembleStoryBible(state as never);
    expect(bible.premise).toContain("cursed city");
    expect(bible.themes).toEqual(["guilt", "freedom"]);
    expect(bible.roster.map((r) => r.name)).toEqual(["Mara", "Vex"]);
    expect(bible.worldRules).toContain("Magic costs memory.");
    expect(bible.narratorVoice?.perspective).toBe("3rd-limited");
  });

  it("tolerates empty state with safe defaults", () => {
    const bible = assembleStoryBible({} as never);
    expect(bible.premise).toBe("");
    expect(bible.themes).toEqual([]);
    expect(bible.roster).toEqual([]);
    expect(bible.worldRules).toEqual([]);
  });
});

describe("assembleSceneContract", () => {
  const state = {
    outline: { scenes: [
      { title: "A", goal: "g1", conflict: "c1", hook: "h1", characters: ["Mara"], wordCount: 1500 },
      { title: "B", goal: "g2", conflict: "c2", hook: "h2", characters: ["Mara", "Vex"], wordCount: 800 },
    ] },
    advancedPlan: { motifs: { shadow: "doubt" }, emotionalBeats: { "2": "dread" } },
    valueShifts: new Map<number, number>([[1, -2]]),
  } as unknown as AnyObj;

  it("builds the contract for scene 2 with threaded entering value-shift", () => {
    const c = assembleSceneContract(state as never, 2);
    expect(c.sceneNumber).toBe(2);
    expect(c.goal).toBe("g2");
    expect(c.hook).toBe("h2");
    expect(c.charactersPresent).toEqual(["Mara", "Vex"]);
    expect(c.targetWords).toBe(800);
    expect(c.activeMotifs).toContain("shadow");
    expect(c.valueShiftEntering).toBe(-2); // scene 1's achieved exit
  });

  it("scene 1 enters at 0 (no prior scene)", () => {
    const c = assembleSceneContract(state as never, 1);
    expect(c.valueShiftEntering).toBe(0);
  });

  it("reads the per-scene statusShift from advancedPlan.statusShifts", () => {
    const s = {
      outline: { scenes: [{ title: "A", goal: "g1", characters: ["Mara"] }] },
      advancedPlan: { statusShifts: { "1": "Mara enters low, ends dominant" } },
      valueShifts: new Map<number, number>(),
    } as unknown as AnyObj;
    const c = assembleSceneContract(s as never, 1);
    expect(c.statusShift).toBe("Mara enters low, ends dominant");
  });

  it("leaves statusShift undefined when not planned", () => {
    const c = assembleSceneContract(state as never, 1);
    expect(c.statusShift).toBeUndefined();
  });
});
