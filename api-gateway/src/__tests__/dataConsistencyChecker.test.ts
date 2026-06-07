import { DataConsistencyChecker } from "../utils/dataConsistencyChecker";

// Minimal fakes returning exactly the fields the real methods read.
function makeFakes(opts: {
  characters?: { id: string; qdrant_id?: string }[];
  worldbuilding?: { id: string; element_type?: string; qdrant_id?: string }[];
  drafts?: { id: string; scene_number: number; qdrant_id?: string }[];
  qChars?: { character: { id?: string }; qdrantPointId: string; name?: string }[];
  qWb?: { element: { id?: string }; qdrantPointId: string; elementType?: string }[];
  qScenes?: { scene: { id?: string }; qdrantPointId: string; sceneNumber?: number }[];
  projects?: { id: string }[];
} = {}) {
  const supabase = {
    getCharacters: jest.fn(async () => opts.characters ?? []),
    getWorldbuilding: jest.fn(async () => opts.worldbuilding ?? []),
    getDrafts: jest.fn(async () => opts.drafts ?? []),
    listProjects: jest.fn(async (_page: number, _size: number) => ({ projects: opts.projects ?? [] })),
  };
  const qdrant = {
    getProjectCharacters: jest.fn(async () => opts.qChars ?? []),
    getProjectWorldbuilding: jest.fn(async () => opts.qWb ?? []),
    getProjectScenes: jest.fn(async () => opts.qScenes ?? []),
    storeCharacter: jest.fn(async () => undefined),
    storeWorldbuilding: jest.fn(async () => undefined),
    storeScene: jest.fn(async () => undefined),
  };
  return { supabase, qdrant };
}

describe("DataConsistencyChecker.checkProjectConsistency (real class)", () => {
  it("reports a fully consistent project", async () => {
    const { supabase, qdrant } = makeFakes({
      characters: [{ id: "c1", qdrant_id: "q1" }],
      worldbuilding: [{ id: "w1", qdrant_id: "qw1" }],
      drafts: [{ id: "d1", scene_number: 1, qdrant_id: "qs1" }],
      qChars: [{ character: { id: "c1" }, qdrantPointId: "q1" }],
      qWb: [{ element: { id: "w1" }, qdrantPointId: "qw1" }],
      qScenes: [{ scene: { id: "d1" }, qdrantPointId: "qs1" }],
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const report = await checker.checkProjectConsistency("p1");
    expect(report.summary.isConsistent).toBe(true);
    expect(report.summary.orphanedVectors).toBe(0);
    expect(report.summary.missingEmbeddings).toBe(0);
  });

  it("detects an orphaned character vector (in Qdrant, absent from Supabase)", async () => {
    const { supabase, qdrant } = makeFakes({
      characters: [{ id: "c1", qdrant_id: "q1" }],
      qChars: [
        { character: { id: "c1" }, qdrantPointId: "q1" },
        { character: { id: "c2" }, qdrantPointId: "q2-orphan" },
      ],
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const report = await checker.checkProjectConsistency("p1");
    expect(report.checks.characters.orphanedVectorIds).toContain("q2-orphan");
    expect(report.summary.isConsistent).toBe(false);
  });

  it("treats a Qdrant point with no inner id as orphaned", async () => {
    const { supabase, qdrant } = makeFakes({
      worldbuilding: [{ id: "w1", qdrant_id: "qw1" }],
      qWb: [
        { element: { id: "w1" }, qdrantPointId: "qw1" },
        { element: {}, qdrantPointId: "qw-orphan" },
      ],
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const report = await checker.checkProjectConsistency("p1");
    expect(report.checks.worldbuilding.orphanedVectorIds).toContain("qw-orphan");
  });

  it("detects a missing embedding (Supabase row without qdrant_id)", async () => {
    const { supabase, qdrant } = makeFakes({
      characters: [{ id: "c1" }], // no qdrant_id
      qChars: [],
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const report = await checker.checkProjectConsistency("p1");
    expect(report.checks.characters.missingEmbeddingIds).toEqual(["c1"]);
    expect(report.summary.missingEmbeddings).toBe(1);
  });

  it("detects an orphaned scene vector", async () => {
    const { supabase, qdrant } = makeFakes({
      drafts: [{ id: "d1", scene_number: 1, qdrant_id: "qs1" }],
      qScenes: [
        { scene: { id: "d1" }, qdrantPointId: "qs1" },
        { scene: { id: "d3" }, qdrantPointId: "qs3-orphan" },
      ],
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const report = await checker.checkProjectConsistency("p1");
    expect(report.checks.scenes.orphanedVectorIds).toContain("qs3-orphan");
  });
});

describe("DataConsistencyChecker.checkGlobalConsistency (real class)", () => {
  it("aggregates per-project reports, counts inconsistent ones", async () => {
    // Single project with a missing embedding — produces one inconsistent report
    const { supabase, qdrant } = makeFakes({
      projects: [{ id: "p1" }],
      characters: [{ id: "c1" }], // no qdrant_id -> missing embedding
      qChars: [],
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const report = await checker.checkGlobalConsistency();
    expect(report.globalSummary.totalProjects).toBe(1);
    expect(report.globalSummary.inconsistentProjects).toBe(1);
    expect(report.projectReports).toHaveLength(1);
    expect(report.projectReports[0].projectId).toBe("p1");
  });

  it("reports zero inconsistent projects when all are consistent", async () => {
    const { supabase, qdrant } = makeFakes({
      projects: [{ id: "p1" }],
      characters: [{ id: "c1", qdrant_id: "q1" }],
      qChars: [{ character: { id: "c1" }, qdrantPointId: "q1" }],
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const report = await checker.checkGlobalConsistency();
    expect(report.globalSummary.totalProjects).toBe(1);
    expect(report.globalSummary.inconsistentProjects).toBe(0);
    expect(report.projectReports).toHaveLength(0);
  });
});

describe("DataConsistencyChecker.repairMissingEmbeddings (real class)", () => {
  it("re-indexes only rows missing qdrant_id and counts repairs", async () => {
    const { supabase, qdrant } = makeFakes({
      characters: [{ id: "c1" }, { id: "c2", qdrant_id: "q2" }], // only c1 needs repair
      worldbuilding: [{ id: "w1" }], // needs repair
      drafts: [{ id: "d1", scene_number: 1 }], // needs repair (no runtime qdrant_id)
    });
    const checker = new DataConsistencyChecker(supabase as never, qdrant as never);
    const result = await checker.repairMissingEmbeddings("p1");
    expect(result.repairedCharacters).toBe(1);
    expect(result.repairedWorldbuilding).toBe(1);
    expect(result.repairedScenes).toBe(1);
    expect(qdrant.storeCharacter).toHaveBeenCalledTimes(1);
    expect(result.errors).toEqual([]);
  });
});
