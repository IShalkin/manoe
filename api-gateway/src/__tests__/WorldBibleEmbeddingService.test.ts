/**
 * Unit tests for WorldBibleEmbeddingService
 * 
 * Tests the World Bible embedding functionality including:
 * - Section storage (characters, locations, rules, etc.)
 * - Semantic search
 * - Consistency checking
 * - Worldbuilding indexing
 */

const mockUpsert = jest.fn().mockResolvedValue({});
const mockSearch = jest.fn().mockResolvedValue([]);
const mockScroll = jest.fn().mockResolvedValue({ points: [] });
const mockDelete = jest.fn().mockResolvedValue({});
const mockGetCollection = jest.fn().mockResolvedValue({});
const mockCreateCollection = jest.fn().mockResolvedValue({});

jest.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    upsert: mockUpsert,
    search: mockSearch,
    scroll: mockScroll,
    delete: mockDelete,
    getCollection: mockGetCollection,
    createCollection: mockCreateCollection,
  })),
}));

const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
  data: [{ embedding: Array(1536).fill(0.1) }],
});

jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: mockEmbeddingsCreate,
      },
    })),
  };
});

jest.mock("uuid", () => ({
  v4: jest.fn().mockReturnValue("test-uuid-1234"),
}));

jest.mock("../services/MetricsService", () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    recordQdrantOperation: jest.fn(),
  })),
}));

import {
  WorldBibleEmbeddingService,
  WorldBibleSectionType,
} from "../services/WorldBibleEmbeddingService";

describe("WorldBibleEmbeddingService", () => {
  let service: WorldBibleEmbeddingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorldBibleEmbeddingService();
    (service as unknown as { metricsService: { recordQdrantOperation: () => void } }).metricsService = {
      recordQdrantOperation: jest.fn(),
    };
  });

  describe("connect", () => {
    it("should connect with OpenAI embeddings when API key provided", async () => {
      await service.connect("test-openai-key");
      expect(service.connected).toBe(true);
      expect(service.collection).toContain("1536");
    });

    it("should connect with local mode when no API key provided", async () => {
      await service.connect();
      expect(service.connected).toBe(true);
      expect(service.collection).toContain("768");
    });

    it("should connect with Gemini embeddings when Gemini API key provided", async () => {
      await service.connect(undefined, "test-gemini-key");
      expect(service.connected).toBe(true);
      expect(service.collection).toContain("768");
    });

    it("should prioritize Gemini over OpenAI when both keys provided", async () => {
      await service.connect("test-openai-key", "test-gemini-key");
      expect(service.connected).toBe(true);
      expect(service.collection).toContain("768");
    });

    it("should throw error when trying to generate embeddings in LOCAL mode", async () => {
      await service.connect();
      await expect(service.storeCharacter("project-1", { name: "Test" }))
        .rejects.toThrow("Semantic search unavailable - no embedding API configured");
    });

    it("should not reconnect if already connected", async () => {
      await service.connect();
      const firstCollection = service.collection;
      await service.connect("different-key");
      expect(service.collection).toBe(firstCollection);
    });

    it("should create collection if it does not exist", async () => {
      mockGetCollection.mockRejectedValueOnce(new Error("Collection not found"));
      await service.connect();
      expect(mockCreateCollection).toHaveBeenCalled();
    });
  });

  describe("storeCharacter", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should store a character and return point ID", async () => {
      const character = {
        name: "John Doe",
        role: "protagonist",
        archetype: "hero",
        coreMotivation: "Save the world",
        backstory: "Orphaned at young age",
      };

      const pointId = await service.storeCharacter("project-1", character);
      expect(pointId).toMatch(/^[a-f0-9]{64}$/);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.stringContaining("world_bible"),
        expect.objectContaining({
          points: expect.arrayContaining([
            expect.objectContaining({
              id: expect.stringMatching(/^[a-f0-9]{64}$/),
              payload: expect.objectContaining({
                projectId: "project-1",
                sectionType: WorldBibleSectionType.CHARACTER,
              }),
            }),
          ]),
        })
      );
    });

    it("should generate deterministic ID for same content", async () => {
      const character = { name: "Jane Doe", role: "antagonist" };
      
      const pointId1 = await service.storeCharacter("project-1", character);
      jest.clearAllMocks();
      const pointId2 = await service.storeCharacter("project-1", character);
      
      expect(pointId1).toBe(pointId2);
    });

    it("should call OpenAI embeddings with correct parameters", async () => {
      const character = { name: "Test Character", role: "test" };
      await service.storeCharacter("project-1", character);
      
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: expect.stringContaining("Test Character"),
      });
    });
  });

  describe("storeLocation", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should store a location", async () => {
      const location = {
        name: "Dark Forest",
        type: "wilderness",
        description: "A mysterious forest shrouded in mist",
        significance: "Where the hero begins their journey",
      };

      const pointId = await service.storeLocation("project-1", location);
      expect(pointId).toMatch(/^[a-f0-9]{64}$/);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.stringContaining("world_bible"),
        expect.objectContaining({
          points: expect.arrayContaining([
            expect.objectContaining({
              payload: expect.objectContaining({
                sectionType: WorldBibleSectionType.LOCATION,
              }),
            }),
          ]),
        })
      );
    });
  });

  describe("storeRule", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should store a world rule and return deterministic ID", async () => {
      const rule = {
        category: "magic",
        name: "Law of Equivalent Exchange",
        description: "To gain something, something of equal value must be lost",
        implications: "Limits the power of magic users",
      };

      const pointId = await service.storeRule("project-1", rule);
      expect(pointId).toMatch(/^[a-f0-9]{64}$/);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.stringContaining("world_bible"),
        expect.objectContaining({
          points: expect.arrayContaining([
            expect.objectContaining({
              payload: expect.objectContaining({
                sectionType: WorldBibleSectionType.RULE,
              }),
            }),
          ]),
        })
      );
    });
  });

  describe("searchSimilar", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should search for similar sections", async () => {
      mockSearch.mockResolvedValueOnce([
        {
          id: "result-1",
          score: 0.85,
          payload: {
            projectId: "project-1",
            sectionType: WorldBibleSectionType.CHARACTER,
            content: "John Doe is the hero",
            metadata: { name: "John Doe" },
            contentHash: "abc123",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      ]);

      const results = await service.searchSimilar("project-1", "hero named John");
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.85);
      expect(results[0].payload.sectionType).toBe(WorldBibleSectionType.CHARACTER);
    });

    it("should filter by section type when provided", async () => {
      await service.searchSimilar("project-1", "query", 5, WorldBibleSectionType.LOCATION);
      expect(mockSearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.objectContaining({
            must: expect.arrayContaining([
              { key: "sectionType", match: { value: WorldBibleSectionType.LOCATION } },
            ]),
          }),
        })
      );
    });
  });

  describe("checkSemanticConsistency", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should detect potential contradictions above threshold", async () => {
      mockSearch.mockResolvedValueOnce([
        {
          id: "result-1",
          score: 0.85,
          payload: {
            projectId: "project-1",
            sectionType: WorldBibleSectionType.CHARACTER,
            content: "John has blue eyes",
            metadata: {},
            contentHash: "abc",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
        {
          id: "result-2",
          score: 0.65,
          payload: {
            projectId: "project-1",
            sectionType: WorldBibleSectionType.LOCATION,
            content: "The castle is on a hill",
            metadata: {},
            contentHash: "def",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      ]);

      const result = await service.checkSemanticConsistency(
        "project-1",
        "John looked at her with his green eyes"
      );

      expect(result.hasContradiction).toBe(true);
      expect(result.contradictionScore).toBe(0.85);
      expect(result.conflictingSections).toHaveLength(1);
      expect(result.explanation).toContain("1 related World Bible section");
    });

    it("should not flag contradictions below threshold", async () => {
      mockSearch.mockResolvedValueOnce([
        {
          id: "result-1",
          score: 0.5,
          payload: {
            projectId: "project-1",
            sectionType: WorldBibleSectionType.CHARACTER,
            content: "John is a warrior",
            metadata: {},
            contentHash: "abc",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      ]);

      const result = await service.checkSemanticConsistency(
        "project-1",
        "John walked through the forest"
      );

      expect(result.hasContradiction).toBe(false);
      expect(result.contradictionScore).toBe(0);
      expect(result.conflictingSections).toHaveLength(0);
    });

    it("should use custom threshold when provided", async () => {
      mockSearch.mockResolvedValueOnce([
        {
          id: "result-1",
          score: 0.6,
          payload: {
            projectId: "project-1",
            sectionType: WorldBibleSectionType.CHARACTER,
            content: "Test content",
            metadata: {},
            contentHash: "abc",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      ]);

      const result = await service.checkSemanticConsistency(
        "project-1",
        "Test query",
        0.5
      );

      expect(result.hasContradiction).toBe(true);
      expect(result.conflictingSections).toHaveLength(1);
    });

    it("should flag contradictions at exact threshold boundary", async () => {
      mockSearch.mockResolvedValueOnce([
        {
          id: "result-1",
          score: 0.7,
          payload: {
            projectId: "project-1",
            sectionType: WorldBibleSectionType.CHARACTER,
            content: "Boundary test content",
            metadata: {},
            contentHash: "boundary",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      ]);

      const result = await service.checkSemanticConsistency(
        "project-1",
        "Test query at boundary",
        0.7
      );

      expect(result.hasContradiction).toBe(true);
      expect(result.conflictingSections).toHaveLength(1);
    });
  });

  describe("indexWorldbuilding", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should index all worldbuilding elements", async () => {
      const worldbuilding = {
        locations: [
          { name: "Forest", type: "wilderness" },
          { name: "Castle", type: "structure" },
        ],
        cultures: [
          { name: "Elves", description: "Ancient forest dwellers" },
        ],
        rules: [
          { category: "magic", name: "No resurrection" },
        ],
        organizations: [
          { name: "The Guild", type: "merchant" },
        ],
      };

      const result = await service.indexWorldbuilding("project-1", worldbuilding);
      expect(result.indexed).toBe(5);
      expect(result.errors).toHaveLength(0);
      expect(mockUpsert).toHaveBeenCalledTimes(5);
    });

    it("should handle errors during indexing", async () => {
      mockUpsert.mockRejectedValueOnce(new Error("Qdrant error"));

      const worldbuilding = {
        locations: [{ name: "Forest", type: "wilderness" }],
      };

      const result = await service.indexWorldbuilding("project-1", worldbuilding);
      expect(result.indexed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Failed to index location");
    });
  });

  describe("indexCharacters", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should index all characters", async () => {
      const characters = [
        { name: "Hero", role: "protagonist" },
        { name: "Villain", role: "antagonist" },
        { name: "Mentor", role: "supporting" },
      ];

      const result = await service.indexCharacters("project-1", characters);
      expect(result.indexed).toBe(3);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("getProjectSections", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should return all sections for a project", async () => {
      mockScroll.mockResolvedValueOnce({
        points: [
          {
            id: "1",
            payload: {
              projectId: "project-1",
              sectionType: WorldBibleSectionType.CHARACTER,
              content: "Character 1",
            },
          },
          {
            id: "2",
            payload: {
              projectId: "project-1",
              sectionType: WorldBibleSectionType.LOCATION,
              content: "Location 1",
            },
          },
        ],
        next_page_offset: null,
      });

      const sections = await service.getProjectSections("project-1");
      expect(sections).toHaveLength(2);
    });

    it("should filter by section type", async () => {
      mockScroll.mockResolvedValueOnce({
        points: [],
        next_page_offset: null,
      });
      await service.getProjectSections("project-1", WorldBibleSectionType.CHARACTER);
      expect(mockScroll).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.objectContaining({
            must: expect.arrayContaining([
              { key: "sectionType", match: { value: WorldBibleSectionType.CHARACTER } },
            ]),
          }),
        })
      );
    });

    it("should paginate through all results", async () => {
      mockScroll
        .mockResolvedValueOnce({
          points: [
            { id: "1", payload: { projectId: "project-1", content: "Page 1 Item 1" } },
            { id: "2", payload: { projectId: "project-1", content: "Page 1 Item 2" } },
          ],
          next_page_offset: "offset-1",
        })
        .mockResolvedValueOnce({
          points: [
            { id: "3", payload: { projectId: "project-1", content: "Page 2 Item 1" } },
          ],
          next_page_offset: null,
        });

      const sections = await service.getProjectSections("project-1");
      expect(sections).toHaveLength(3);
      expect(mockScroll).toHaveBeenCalledTimes(2);
    });
  });

  describe("deleteProjectData", () => {
    beforeEach(async () => {
      await service.connect("test-openai-key");
    });

    it("should delete all data for a project", async () => {
      await service.deleteProjectData("project-1");
      expect(mockDelete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          filter: expect.objectContaining({
            must: [{ key: "projectId", match: { value: "project-1" } }],
          }),
        })
      );
    });
  });

  describe("disconnect", () => {
    it("should disconnect and reset state", async () => {
      await service.connect("test-openai-key");
      expect(service.connected).toBe(true);

      await service.disconnect();
      expect(service.connected).toBe(false);
    });
  });
});
