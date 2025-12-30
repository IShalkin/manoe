import { Controller, Get, Post, PathParams, QueryParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { SupabaseService } from "../services/SupabaseService";
import { QdrantMemoryService } from "../services/QdrantMemoryService";

@Controller("/memory")
@Tags("Memory")
@Description("Vector memory retrieval endpoints")
export class MemoryController {
  @Inject()
  private supabaseService: SupabaseService;

  @Inject()
  private qdrantMemory: QdrantMemoryService;

  @Get("/characters/:projectId")
  @Summary("Get project characters")
  @Description("Retrieve all character profiles for a project")
  async getCharacters(
    @PathParams("projectId") projectId: string
  ): Promise<{ characters: unknown[]; count: number }> {
    const characters = await this.supabaseService.getCharacters(projectId);
    return {
      characters,
      count: characters.length,
    };
  }

  @Get("/characters/:projectId/search")
  @Summary("Search characters")
  @Description("Search characters by semantic similarity using Qdrant vector search")
  @Returns(200, { description: "Search results with relevance scores", type: Object })
  async searchCharacters(
    @PathParams("projectId") projectId: string,
    @QueryParams("query") query: string,
    @QueryParams("limit") limit: number = 5
  ): Promise<{ results: unknown[] }> {
    try {
      const results = await this.qdrantMemory.searchCharacters(projectId, query, limit);

      const formattedResults = results.map(result => ({
        ...result.payload.character,
        relevanceScore: result.score,
        qdrantPointId: result.id,
      }));

      return { results: formattedResults };
    } catch (error) {
      console.error(`[MemoryController] Qdrant search failed, falling back to text search:`, error);

      const characters = await this.supabaseService.getCharacters(projectId);
      const filtered = characters.filter((c: { name?: string; archetype?: string }) =>
        c.name?.toLowerCase().includes(query.toLowerCase()) ||
        c.archetype?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, limit);

      return { results: filtered };
    }
  }

  @Get("/worldbuilding/:projectId")
  @Summary("Get worldbuilding elements")
  @Description("Retrieve all worldbuilding elements for a project")
  async getWorldbuilding(
    @PathParams("projectId") projectId: string,
    @QueryParams("type") elementType?: string
  ): Promise<{ elements: unknown[]; count: number }> {
    const elements = await this.supabaseService.getWorldbuilding(projectId, elementType);
    return {
      elements,
      count: elements.length,
    };
  }

  @Get("/scenes/:projectId")
  @Summary("Get project scenes")
  @Description("Retrieve all scene drafts for a project")
  async getScenes(
    @PathParams("projectId") projectId: string
  ): Promise<{ scenes: unknown[]; count: number }> {
    const drafts = await this.supabaseService.getDrafts(projectId);
    return {
      scenes: drafts,
      count: drafts.length,
    };
  }

  @Get("/scenes/:projectId/:sceneNumber")
  @Summary("Get specific scene")
  @Description("Retrieve a specific scene draft")
  async getScene(
    @PathParams("projectId") projectId: string,
    @PathParams("sceneNumber") sceneNumber: number
  ): Promise<unknown> {
    const drafts = await this.supabaseService.getDrafts(projectId);
    const scene = drafts.find((d: { scene_number: number }) => d.scene_number === sceneNumber);
    
    if (!scene) {
      throw new Error(`Scene ${sceneNumber} not found`);
    }
    
    return scene;
  }

  @Get("/outline/:projectId")
  @Summary("Get plot outline")
  @Description("Retrieve the plot outline for a project")
  async getOutline(
    @PathParams("projectId") projectId: string
  ): Promise<unknown> {
    const outline = await this.supabaseService.getOutline(projectId);
    
    if (!outline) {
      throw new Error("Outline not found");
    }
    
    return outline;
  }

  @Get("/critiques/:projectId")
  @Summary("Get scene critiques")
  @Description("Retrieve all critiques for a project")
  async getCritiques(
    @PathParams("projectId") projectId: string
  ): Promise<{ critiques: unknown[]; count: number }> {
    const critiques = await this.supabaseService.getCritiques(projectId);
    return {
      critiques,
      count: critiques.length,
    };
  }

  @Get("/audit/:projectId")
  @Summary("Get audit logs")
  @Description("Retrieve agent audit logs for a project")
  async getAuditLogs(
    @PathParams("projectId") projectId: string,
    @QueryParams("agent") agentName?: string,
    @QueryParams("limit") limit: number = 50
  ): Promise<{ logs: unknown[]; count: number }> {
    const logs = await this.supabaseService.getAuditLogs(projectId, agentName, limit);
    return {
      logs,
      count: logs.length,
    };
  }

  @Get("/worldbuilding/:projectId/search")
  @Summary("Search worldbuilding elements")
  @Description("Search worldbuilding elements by semantic similarity using Qdrant vector search")
  @Returns(200, { description: "Search results with relevance scores", type: Object })
  async searchWorldbuilding(
    @PathParams("projectId") projectId: string,
    @QueryParams("query") query: string,
    @QueryParams("limit") limit: number = 5
  ): Promise<{ results: unknown[] }> {
    try {
      const results = await this.qdrantMemory.searchWorldbuilding(projectId, query, limit);

      const formattedResults = results.map(result => ({
        elementType: result.payload.elementType,
        element: result.payload.element,
        relevanceScore: result.score,
        qdrantPointId: result.id,
      }));

      return { results: formattedResults };
    } catch (error) {
      console.error(`[MemoryController] Qdrant worldbuilding search failed:`, error);
      return { results: [] };
    }
  }

  @Get("/scenes/:projectId/search")
  @Summary("Search scenes")
  @Description("Search scenes by semantic similarity using Qdrant vector search")
  @Returns(200, { description: "Search results with relevance scores", type: Object })
  async searchScenes(
    @PathParams("projectId") projectId: string,
    @QueryParams("query") query: string,
    @QueryParams("limit") limit: number = 3
  ): Promise<{ results: unknown[] }> {
    try {
      const results = await this.qdrantMemory.searchScenes(projectId, query, limit);

      const formattedResults = results.map(result => ({
        sceneNumber: result.payload.sceneNumber,
        scene: result.payload.scene,
        relevanceScore: result.score,
        qdrantPointId: result.id,
      }));

      return { results: formattedResults };
    } catch (error) {
      console.error(`[MemoryController] Qdrant scene search failed:`, error);
      return { results: [] };
    }
  }

  @Post("/projects/:projectId/reindex")
  @Summary("Reindex project to Qdrant")
  @Description("Reindex all project artifacts (characters, worldbuilding, scenes) to Qdrant vector memory")
  @Returns(200, { description: "Reindex results with counts and errors", type: Object })
  async reindexProject(
    @PathParams("projectId") projectId: string
  ): Promise<{ indexed: { characters: number; worldbuilding: number; drafts: number }; errors: string[] }> {
    const result = await this.supabaseService.reindexProject(projectId);
    return {
      indexed: {
        characters: result.characters,
        worldbuilding: result.worldbuilding,
        drafts: result.drafts,
      },
      errors: result.errors,
    };
  }
}
