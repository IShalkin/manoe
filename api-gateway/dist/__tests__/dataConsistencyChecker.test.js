"use strict";
/**
 * Unit Tests for DataConsistencyChecker Logic
 *
 * Tests the data consistency verification logic without importing the actual module.
 * These tests verify the logic for detecting orphaned vectors and missing embeddings.
 */
describe("DataConsistencyChecker Logic", () => {
    describe("ConsistencyCheckResult structure", () => {
        it("should have correct structure for healthy result", () => {
            const result = {
                supabaseCount: 10,
                qdrantCount: 10,
                orphanedVectorIds: [],
                missingEmbeddingIds: [],
                isConsistent: true,
            };
            expect(result.supabaseCount).toBe(10);
            expect(result.qdrantCount).toBe(10);
            expect(result.orphanedVectorIds).toHaveLength(0);
            expect(result.missingEmbeddingIds).toHaveLength(0);
            expect(result.isConsistent).toBe(true);
        });
        it("should have correct structure for inconsistent result", () => {
            const result = {
                supabaseCount: 10,
                qdrantCount: 12,
                orphanedVectorIds: ["orphan-1", "orphan-2"],
                missingEmbeddingIds: ["missing-1"],
                isConsistent: false,
            };
            expect(result.supabaseCount).toBe(10);
            expect(result.qdrantCount).toBe(12);
            expect(result.orphanedVectorIds).toHaveLength(2);
            expect(result.missingEmbeddingIds).toHaveLength(1);
            expect(result.isConsistent).toBe(false);
        });
    });
    describe("consistency calculation logic", () => {
        const calculateConsistency = (orphanedCount, missingCount) => {
            return orphanedCount === 0 && missingCount === 0;
        };
        it("should return true when no issues", () => {
            expect(calculateConsistency(0, 0)).toBe(true);
        });
        it("should return false when there are orphaned vectors", () => {
            expect(calculateConsistency(2, 0)).toBe(false);
        });
        it("should return false when there are missing embeddings", () => {
            expect(calculateConsistency(0, 2)).toBe(false);
        });
        it("should return false when both issues exist", () => {
            expect(calculateConsistency(1, 1)).toBe(false);
        });
    });
    describe("orphaned vector detection logic", () => {
        const findOrphanedVectors = (supabaseIds, qdrantIds) => {
            const supabaseIdSet = new Set(supabaseIds);
            return qdrantIds.filter(id => !supabaseIdSet.has(id));
        };
        it("should return empty array when all vectors have matching records", () => {
            const supabaseIds = ["id-1", "id-2", "id-3"];
            const qdrantIds = ["id-1", "id-2", "id-3"];
            expect(findOrphanedVectors(supabaseIds, qdrantIds)).toHaveLength(0);
        });
        it("should detect orphaned vectors", () => {
            const supabaseIds = ["id-1", "id-2"];
            const qdrantIds = ["id-1", "id-2", "id-3", "id-4"];
            const orphaned = findOrphanedVectors(supabaseIds, qdrantIds);
            expect(orphaned).toHaveLength(2);
            expect(orphaned).toContain("id-3");
            expect(orphaned).toContain("id-4");
        });
        it("should handle empty supabase records", () => {
            const supabaseIds = [];
            const qdrantIds = ["id-1", "id-2"];
            const orphaned = findOrphanedVectors(supabaseIds, qdrantIds);
            expect(orphaned).toHaveLength(2);
        });
        it("should handle empty qdrant vectors", () => {
            const supabaseIds = ["id-1", "id-2"];
            const qdrantIds = [];
            const orphaned = findOrphanedVectors(supabaseIds, qdrantIds);
            expect(orphaned).toHaveLength(0);
        });
    });
    describe("missing embedding detection logic", () => {
        const findMissingEmbeddings = (entities) => {
            return entities
                .filter(entity => !entity.qdrant_id)
                .map(entity => entity.id);
        };
        it("should return empty array when all entities have embeddings", () => {
            const entities = [
                { id: "entity-1", qdrant_id: "qdrant-1" },
                { id: "entity-2", qdrant_id: "qdrant-2" },
            ];
            expect(findMissingEmbeddings(entities)).toHaveLength(0);
        });
        it("should detect entities without embeddings", () => {
            const entities = [
                { id: "entity-1", qdrant_id: "qdrant-1" },
                { id: "entity-2", qdrant_id: null },
                { id: "entity-3" },
            ];
            const missing = findMissingEmbeddings(entities);
            expect(missing).toHaveLength(2);
            expect(missing).toContain("entity-2");
            expect(missing).toContain("entity-3");
        });
        it("should handle empty entity list", () => {
            const entities = [];
            expect(findMissingEmbeddings(entities)).toHaveLength(0);
        });
        it("should handle all entities missing embeddings", () => {
            const entities = [
                { id: "entity-1" },
                { id: "entity-2", qdrant_id: null },
            ];
            const missing = findMissingEmbeddings(entities);
            expect(missing).toHaveLength(2);
        });
    });
    describe("summary aggregation logic", () => {
        const aggregateSummary = (checks) => {
            const totalOrphanedVectors = checks.reduce((sum, check) => sum + check.orphanedVectorIds.length, 0);
            const totalMissingEmbeddings = checks.reduce((sum, check) => sum + check.missingEmbeddingIds.length, 0);
            const isConsistent = checks.every(check => check.isConsistent);
            return {
                totalOrphanedVectors,
                totalMissingEmbeddings,
                isConsistent,
            };
        };
        it("should aggregate zero issues correctly", () => {
            const checks = [
                { orphanedVectorIds: [], missingEmbeddingIds: [], isConsistent: true },
                { orphanedVectorIds: [], missingEmbeddingIds: [], isConsistent: true },
            ];
            const summary = aggregateSummary(checks);
            expect(summary.totalOrphanedVectors).toBe(0);
            expect(summary.totalMissingEmbeddings).toBe(0);
            expect(summary.isConsistent).toBe(true);
        });
        it("should aggregate orphaned vectors correctly", () => {
            const checks = [
                { orphanedVectorIds: ["o1", "o2"], missingEmbeddingIds: [], isConsistent: false },
                { orphanedVectorIds: ["o3"], missingEmbeddingIds: [], isConsistent: false },
            ];
            const summary = aggregateSummary(checks);
            expect(summary.totalOrphanedVectors).toBe(3);
            expect(summary.isConsistent).toBe(false);
        });
        it("should aggregate missing embeddings correctly", () => {
            const checks = [
                { orphanedVectorIds: [], missingEmbeddingIds: ["m1"], isConsistent: false },
                { orphanedVectorIds: [], missingEmbeddingIds: ["m2", "m3"], isConsistent: false },
            ];
            const summary = aggregateSummary(checks);
            expect(summary.totalMissingEmbeddings).toBe(3);
            expect(summary.isConsistent).toBe(false);
        });
        it("should mark as inconsistent if any check is inconsistent", () => {
            const checks = [
                { orphanedVectorIds: [], missingEmbeddingIds: [], isConsistent: true },
                { orphanedVectorIds: ["o1"], missingEmbeddingIds: [], isConsistent: false },
                { orphanedVectorIds: [], missingEmbeddingIds: [], isConsistent: true },
            ];
            const summary = aggregateSummary(checks);
            expect(summary.isConsistent).toBe(false);
        });
    });
    describe("global report aggregation logic", () => {
        const aggregateGlobalReport = (projectSummaries) => {
            const consistentProjects = projectSummaries.filter(p => p.isConsistent).length;
            const totalOrphanedVectors = projectSummaries.reduce((sum, p) => sum + p.orphanedVectors, 0);
            const totalMissingEmbeddings = projectSummaries.reduce((sum, p) => sum + p.missingEmbeddings, 0);
            return {
                totalProjects: projectSummaries.length,
                consistentProjects,
                inconsistentProjects: projectSummaries.length - consistentProjects,
                totalOrphanedVectors,
                totalMissingEmbeddings,
            };
        };
        it("should aggregate empty project list", () => {
            const result = aggregateGlobalReport([]);
            expect(result.totalProjects).toBe(0);
            expect(result.consistentProjects).toBe(0);
            expect(result.inconsistentProjects).toBe(0);
        });
        it("should aggregate all consistent projects", () => {
            const summaries = [
                { isConsistent: true, orphanedVectors: 0, missingEmbeddings: 0 },
                { isConsistent: true, orphanedVectors: 0, missingEmbeddings: 0 },
            ];
            const result = aggregateGlobalReport(summaries);
            expect(result.totalProjects).toBe(2);
            expect(result.consistentProjects).toBe(2);
            expect(result.inconsistentProjects).toBe(0);
        });
        it("should aggregate mixed consistency projects", () => {
            const summaries = [
                { isConsistent: true, orphanedVectors: 0, missingEmbeddings: 0 },
                { isConsistent: false, orphanedVectors: 2, missingEmbeddings: 1 },
                { isConsistent: false, orphanedVectors: 1, missingEmbeddings: 0 },
            ];
            const result = aggregateGlobalReport(summaries);
            expect(result.totalProjects).toBe(3);
            expect(result.consistentProjects).toBe(1);
            expect(result.inconsistentProjects).toBe(2);
            expect(result.totalOrphanedVectors).toBe(3);
            expect(result.totalMissingEmbeddings).toBe(1);
        });
    });
    describe("repair action generation logic", () => {
        const generateRepairActions = (checks) => {
            const actions = [];
            for (const id of checks.characters.orphanedVectorIds) {
                actions.push({ type: "delete_orphan", entityType: "character", entityId: id });
            }
            for (const id of checks.worldbuilding.orphanedVectorIds) {
                actions.push({ type: "delete_orphan", entityType: "worldbuilding", entityId: id });
            }
            for (const id of checks.scenes.orphanedVectorIds) {
                actions.push({ type: "delete_orphan", entityType: "scene", entityId: id });
            }
            for (const id of checks.characters.missingEmbeddingIds) {
                actions.push({ type: "create_embedding", entityType: "character", entityId: id });
            }
            for (const id of checks.worldbuilding.missingEmbeddingIds) {
                actions.push({ type: "create_embedding", entityType: "worldbuilding", entityId: id });
            }
            for (const id of checks.scenes.missingEmbeddingIds) {
                actions.push({ type: "create_embedding", entityType: "scene", entityId: id });
            }
            return actions;
        };
        it("should generate no actions for consistent checks", () => {
            const checks = {
                characters: { orphanedVectorIds: [], missingEmbeddingIds: [] },
                worldbuilding: { orphanedVectorIds: [], missingEmbeddingIds: [] },
                scenes: { orphanedVectorIds: [], missingEmbeddingIds: [] },
            };
            const actions = generateRepairActions(checks);
            expect(actions).toHaveLength(0);
        });
        it("should generate delete actions for orphaned vectors", () => {
            const checks = {
                characters: { orphanedVectorIds: ["orphan-1", "orphan-2"], missingEmbeddingIds: [] },
                worldbuilding: { orphanedVectorIds: [], missingEmbeddingIds: [] },
                scenes: { orphanedVectorIds: [], missingEmbeddingIds: [] },
            };
            const actions = generateRepairActions(checks);
            expect(actions).toHaveLength(2);
            expect(actions[0].type).toBe("delete_orphan");
            expect(actions[0].entityType).toBe("character");
        });
        it("should generate create actions for missing embeddings", () => {
            const checks = {
                characters: { orphanedVectorIds: [], missingEmbeddingIds: [] },
                worldbuilding: { orphanedVectorIds: [], missingEmbeddingIds: ["missing-1"] },
                scenes: { orphanedVectorIds: [], missingEmbeddingIds: [] },
            };
            const actions = generateRepairActions(checks);
            expect(actions).toHaveLength(1);
            expect(actions[0].type).toBe("create_embedding");
            expect(actions[0].entityType).toBe("worldbuilding");
        });
        it("should generate mixed actions", () => {
            const checks = {
                characters: { orphanedVectorIds: ["o1"], missingEmbeddingIds: ["m1"] },
                worldbuilding: { orphanedVectorIds: [], missingEmbeddingIds: [] },
                scenes: { orphanedVectorIds: ["o2"], missingEmbeddingIds: ["m2", "m3"] },
            };
            const actions = generateRepairActions(checks);
            expect(actions).toHaveLength(5);
            const deleteActions = actions.filter(a => a.type === "delete_orphan");
            const createActions = actions.filter(a => a.type === "create_embedding");
            expect(deleteActions).toHaveLength(2);
            expect(createActions).toHaveLength(3);
        });
    });
});
//# sourceMappingURL=dataConsistencyChecker.test.js.map