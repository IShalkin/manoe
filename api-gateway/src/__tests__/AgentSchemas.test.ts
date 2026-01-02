/**
 * Unit tests for Agent Schemas
 * Tests Zod validation schemas for agent outputs, especially World State tracking
 */

import { ArchivistOutputSchema } from "../schemas/AgentSchemas";

describe("AgentSchemas", () => {
  describe("ArchivistOutputSchema", () => {
    describe("worldStateDiff validation", () => {
      it("should accept valid worldStateDiff with character updates", () => {
        const input = {
          constraints: [
            { key: "hero_status", value: "wounded", sceneNumber: 3 }
          ],
          worldStateDiff: {
            characterUpdates: [
              {
                name: "John",
                status: "alive",
                currentLocation: "Castle",
                newAttributes: { mood: "determined" }
              }
            ]
          }
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.worldStateDiff?.characterUpdates).toHaveLength(1);
          expect(result.data.worldStateDiff?.characterUpdates?.[0].name).toBe("John");
          expect(result.data.worldStateDiff?.characterUpdates?.[0].status).toBe("alive");
        }
      });

      it("should accept valid worldStateDiff with new locations", () => {
        const input = {
          worldStateDiff: {
            newLocations: [
              {
                name: "Dark Forest",
                type: "wilderness",
                description: "A mysterious forest shrouded in mist"
              }
            ]
          }
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.worldStateDiff?.newLocations).toHaveLength(1);
          expect(result.data.worldStateDiff?.newLocations?.[0].name).toBe("Dark Forest");
        }
      });

      it("should accept valid worldStateDiff with timeline events", () => {
        const input = {
          worldStateDiff: {
            timelineEvents: [
              {
                event: "The hero discovered the ancient artifact",
                significance: "major"
              },
              {
                event: "A storm began brewing",
                significance: "background"
              }
            ]
          }
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.worldStateDiff?.timelineEvents).toHaveLength(2);
          expect(result.data.worldStateDiff?.timelineEvents?.[0].significance).toBe("major");
        }
      });

      it("should accept all character status values", () => {
        const statuses = ["alive", "dead", "unknown", "transformed"] as const;
        
        for (const status of statuses) {
          const input = {
            worldStateDiff: {
              characterUpdates: [{ name: "Test", status }]
            }
          };
          const result = ArchivistOutputSchema.safeParse(input);
          expect(result.success).toBe(true);
        }
      });

      it("should reject invalid character status", () => {
        const input = {
          worldStateDiff: {
            characterUpdates: [{ name: "Test", status: "invalid_status" }]
          }
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it("should accept all significance values for timeline events", () => {
        const significances = ["major", "minor", "background"] as const;
        
        for (const significance of significances) {
          const input = {
            worldStateDiff: {
              timelineEvents: [{ event: "Test event", significance }]
            }
          };
          const result = ArchivistOutputSchema.safeParse(input);
          expect(result.success).toBe(true);
        }
      });

      it("should accept empty worldStateDiff", () => {
        const input = {
          worldStateDiff: {}
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it("should accept missing worldStateDiff (optional)", () => {
        const input = {
          constraints: [
            { key: "test", value: "value", sceneNumber: 1 }
          ]
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.worldStateDiff).toBeUndefined();
        }
      });

      it("should accept complete worldStateDiff with all fields", () => {
        const input = {
          constraints: [
            { key: "hero_health", value: "critical", sceneNumber: 5, reasoning: "Battle wounds" }
          ],
          conflicts_resolved: ["timeline conflict"],
          discarded_facts: ["minor detail"],
          worldStateDiff: {
            characterUpdates: [
              {
                name: "Hero",
                status: "alive",
                currentLocation: "Battlefield",
                newAttributes: { health: "critical", morale: "high" }
              },
              {
                name: "Villain",
                status: "dead"
              }
            ],
            newLocations: [
              {
                name: "Ancient Temple",
                type: "sacred",
                description: "A crumbling temple with mysterious symbols"
              }
            ],
            timelineEvents: [
              { event: "Final battle began", significance: "major" },
              { event: "Villain defeated", significance: "major" }
            ]
          }
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.constraints).toHaveLength(1);
          expect(result.data.worldStateDiff?.characterUpdates).toHaveLength(2);
          expect(result.data.worldStateDiff?.newLocations).toHaveLength(1);
          expect(result.data.worldStateDiff?.timelineEvents).toHaveLength(2);
        }
      });
    });

    describe("constraints preprocessing", () => {
      it("should filter out constraints with null values", () => {
        const input = {
          constraints: [
            { key: "valid", value: "test", sceneNumber: 1 },
            { key: null, value: "test", sceneNumber: 2 },
            { key: "test", value: null, sceneNumber: 3 },
          ]
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.constraints).toHaveLength(1);
          expect(result.data.constraints?.[0].key).toBe("valid");
        }
      });

      it("should filter out constraints with empty strings", () => {
        const input = {
          constraints: [
            { key: "valid", value: "test", sceneNumber: 1 },
            { key: "", value: "test", sceneNumber: 2 },
            { key: "test", value: "", sceneNumber: 3 },
          ]
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.constraints).toHaveLength(1);
        }
      });

      it("should handle null constraints array", () => {
        const input = {
          constraints: null
        };

        const result = ArchivistOutputSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });
});
