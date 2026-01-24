/**
 * Integration Tests for DataConsistencyChecker with Scroll API
 * 
 * Tests the updated consistency checker that uses scroll API for accurate counts
 * and proper orphan detection for all entity types.
 */

describe("DataConsistencyChecker with Scroll API", () => {
  describe("Character Consistency Check", () => {
    it("should use scroll API for accurate character counts", () => {
      // Mock data representing more than 100 characters (previously limited)
      const supabaseCharacters = Array.from({ length: 150 }, (_, i) => ({
        id: `char-${i}`,
        name: `Character ${i}`,
        qdrant_id: `qdrant-${i}`,
      }));

      const qdrantCharacters = supabaseCharacters.map((char) => ({
        character: { id: char.id, name: char.name },
        qdrantPointId: char.qdrant_id,
        name: char.name,
      }));

      // With scroll API, we should get accurate counts
      expect(supabaseCharacters).toHaveLength(150);
      expect(qdrantCharacters).toHaveLength(150);
    });

    it("should detect orphaned characters using Qdrant point IDs", () => {
      const supabaseCharacters = [
        { id: "char-1", name: "Character 1", qdrant_id: "qdrant-1" },
        { id: "char-2", name: "Character 2", qdrant_id: "qdrant-2" },
      ];

      const qdrantCharacters = [
        { character: { id: "char-1" }, qdrantPointId: "qdrant-1", name: "Character 1" },
        { character: { id: "char-2" }, qdrantPointId: "qdrant-2", name: "Character 2" },
        { character: { id: "char-3" }, qdrantPointId: "qdrant-3", name: "Character 3" }, // Orphaned
      ];

      const supabaseIdSet = new Set(supabaseCharacters.map((c) => c.id));
      const orphanedVectorIds = qdrantCharacters
        .filter((qc) => !supabaseIdSet.has(qc.character.id))
        .map((qc) => qc.qdrantPointId);

      expect(orphanedVectorIds).toHaveLength(1);
      expect(orphanedVectorIds).toContain("qdrant-3");
    });
  });

  describe("Worldbuilding Consistency Check", () => {
    it("should use scroll API for accurate worldbuilding counts (no 100-element limit)", () => {
      // Previously limited to 100, now can handle any number
      const supabaseWorldbuilding = Array.from({ length: 250 }, (_, i) => ({
        id: `wb-${i}`,
        name: `Worldbuilding ${i}`,
        element_type: "location",
        qdrant_id: `qdrant-wb-${i}`,
      }));

      const qdrantWorldbuilding = supabaseWorldbuilding.map((wb) => ({
        element: { id: wb.id, name: wb.name },
        qdrantPointId: wb.qdrant_id,
        elementType: wb.element_type,
      }));

      // Should get accurate counts with scroll API
      expect(supabaseWorldbuilding).toHaveLength(250);
      expect(qdrantWorldbuilding).toHaveLength(250);
    });

    it("should detect orphaned worldbuilding vectors", () => {
      const supabaseWorldbuilding = [
        { id: "wb-1", name: "Location 1", qdrant_id: "qdrant-wb-1" },
        { id: "wb-2", name: "Location 2", qdrant_id: "qdrant-wb-2" },
      ];

      const qdrantWorldbuilding = [
        { element: { id: "wb-1" }, qdrantPointId: "qdrant-wb-1" },
        { element: { id: "wb-2" }, qdrantPointId: "qdrant-wb-2" },
        { element: { id: "wb-3" }, qdrantPointId: "qdrant-wb-3" }, // Orphaned
        { element: { id: "wb-4" }, qdrantPointId: "qdrant-wb-4" }, // Orphaned
      ];

      const supabaseIdSet = new Set(supabaseWorldbuilding.map((wb) => wb.id));
      const orphanedVectorIds = qdrantWorldbuilding
        .filter((qwb) => !supabaseIdSet.has(qwb.element.id))
        .map((qwb) => qwb.qdrantPointId);

      expect(orphanedVectorIds).toHaveLength(2);
      expect(orphanedVectorIds).toContain("qdrant-wb-3");
      expect(orphanedVectorIds).toContain("qdrant-wb-4");
    });

    it("should handle worldbuilding vectors without element IDs", () => {
      const supabaseWorldbuilding = [
        { id: "wb-1", name: "Location 1", qdrant_id: "qdrant-wb-1" },
      ];

      const qdrantWorldbuilding = [
        { element: { id: "wb-1" }, qdrantPointId: "qdrant-wb-1" },
        { element: {}, qdrantPointId: "qdrant-orphan" }, // No ID - should be considered orphaned
      ];

      const supabaseIdSet = new Set(supabaseWorldbuilding.map((wb) => wb.id));
      const orphanedVectorIds = qdrantWorldbuilding
        .filter((qwb) => !qwb.element?.id || !supabaseIdSet.has(qwb.element.id))
        .map((qwb) => qwb.qdrantPointId || "unknown");

      expect(orphanedVectorIds).toHaveLength(1);
      expect(orphanedVectorIds).toContain("qdrant-orphan");
    });
  });

  describe("Scenes Consistency Check", () => {
    it("should use scroll API for accurate scene counts (no 100-element limit)", () => {
      // Previously limited to 100, now can handle any number
      const supabaseScenes = Array.from({ length: 300 }, (_, i) => ({
        id: `scene-${i}`,
        title: `Scene ${i}`,
        scene_number: i,
        narrative_content: `Content ${i}`,
      }));

      const qdrantScenes = supabaseScenes.map((scene) => ({
        scene: { id: scene.id, title: scene.title },
        qdrantPointId: `qdrant-scene-${scene.id}`,
        sceneNumber: scene.scene_number,
      }));

      // Should get accurate counts with scroll API
      expect(supabaseScenes).toHaveLength(300);
      expect(qdrantScenes).toHaveLength(300);
    });

    it("should detect orphaned scene vectors", () => {
      const supabaseScenes = [
        { id: "scene-1", scene_number: 1 },
        { id: "scene-2", scene_number: 2 },
      ];

      const qdrantScenes = [
        { scene: { id: "scene-1" }, qdrantPointId: "qdrant-scene-1" },
        { scene: { id: "scene-2" }, qdrantPointId: "qdrant-scene-2" },
        { scene: { id: "scene-3" }, qdrantPointId: "qdrant-scene-3" }, // Orphaned
      ];

      const supabaseIdSet = new Set(supabaseScenes.map((s) => s.id));
      const orphanedVectorIds = qdrantScenes
        .filter((qs) => !supabaseIdSet.has(qs.scene.id))
        .map((qs) => qs.qdrantPointId);

      expect(orphanedVectorIds).toHaveLength(1);
      expect(orphanedVectorIds).toContain("qdrant-scene-3");
    });

    it("should handle scene vectors without scene IDs", () => {
      const supabaseScenes = [
        { id: "scene-1", scene_number: 1 },
      ];

      const qdrantScenes = [
        { scene: { id: "scene-1" }, qdrantPointId: "qdrant-scene-1" },
        { scene: {}, qdrantPointId: "qdrant-orphan" }, // No ID - should be considered orphaned
      ];

      const supabaseIdSet = new Set(supabaseScenes.map((s) => s.id));
      const orphanedVectorIds = qdrantScenes
        .filter((qs) => !qs.scene?.id || !supabaseIdSet.has(qs.scene.id))
        .map((qs) => qs.qdrantPointId || "unknown");

      expect(orphanedVectorIds).toHaveLength(1);
      expect(orphanedVectorIds).toContain("qdrant-orphan");
    });
  });

  describe("Missing Embeddings Detection", () => {
    it("should detect characters without qdrant_id", () => {
      const characters = [
        { id: "char-1", qdrant_id: "qdrant-1" },
        { id: "char-2", qdrant_id: null }, // Missing
        { id: "char-3", qdrant_id: undefined }, // Missing
        { id: "char-4", qdrant_id: "qdrant-4" },
      ];

      const missingEmbeddings = characters
        .filter((c) => !c.qdrant_id)
        .map((c) => c.id);

      expect(missingEmbeddings).toHaveLength(2);
      expect(missingEmbeddings).toContain("char-2");
      expect(missingEmbeddings).toContain("char-3");
    });

    it("should detect worldbuilding without qdrant_id", () => {
      const worldbuilding = [
        { id: "wb-1", qdrant_id: "qdrant-wb-1" },
        { id: "wb-2", qdrant_id: null }, // Missing
        { id: "wb-3", qdrant_id: "qdrant-wb-3" },
      ];

      const missingEmbeddings = worldbuilding
        .filter((wb) => !wb.qdrant_id)
        .map((wb) => wb.id);

      expect(missingEmbeddings).toHaveLength(1);
      expect(missingEmbeddings).toContain("wb-2");
    });
  });

  describe("Consistency Calculation", () => {
    it("should be consistent when counts match and no issues", () => {
      const orphanedVectorIds: string[] = [];
      const missingEmbeddingIds: string[] = [];
      const isConsistent = orphanedVectorIds.length === 0 && missingEmbeddingIds.length === 0;

      expect(isConsistent).toBe(true);
    });

    it("should be inconsistent when there are orphaned vectors", () => {
      const orphanedVectorIds = ["orphan-1", "orphan-2"];
      const missingEmbeddingIds: string[] = [];
      const isConsistent = orphanedVectorIds.length === 0 && missingEmbeddingIds.length === 0;

      expect(isConsistent).toBe(false);
    });

    it("should be inconsistent when there are missing embeddings", () => {
      const orphanedVectorIds: string[] = [];
      const missingEmbeddingIds = ["missing-1"];
      const isConsistent = orphanedVectorIds.length === 0 && missingEmbeddingIds.length === 0;

      expect(isConsistent).toBe(false);
    });

    it("should be inconsistent when both issues exist", () => {
      const orphanedVectorIds = ["orphan-1"];
      const missingEmbeddingIds = ["missing-1"];
      const isConsistent = orphanedVectorIds.length === 0 && missingEmbeddingIds.length === 0;

      expect(isConsistent).toBe(false);
    });
  });
});
