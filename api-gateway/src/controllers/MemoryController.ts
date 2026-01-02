import { Controller, Get, PathParams, QueryParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { SupabaseService } from "../services/SupabaseService";
import {
  mapCharacterToDTO,
  mapDraftToDTO,
  mapOutlineToDTO,
  mapWorldbuildingToDTO,
  mapCritiqueToDTO,
  mapAuditLogToDTO,
  CharacterDTO,
  DraftDTO,
  OutlineDTO,
  WorldbuildingDTO,
  CritiqueDTO,
  AuditLogDTO,
} from "../utils/entityMappers";

@Controller("/memory")
@Tags("Memory")
@Description("Vector memory retrieval endpoints")
export class MemoryController {
  @Inject()
  private supabaseService: SupabaseService;

  @Get("/characters/:projectId")
  @Summary("Get project characters")
  @Description("Retrieve all character profiles for a project")
  async getCharacters(
    @PathParams("projectId") projectId: string
  ): Promise<{ characters: CharacterDTO[]; count: number }> {
    const characters = await this.supabaseService.getCharacters(projectId);
    const characterDTOs = characters.map(mapCharacterToDTO);
    return {
      characters: characterDTOs,
      count: characters.length,
    };
  }

  @Get("/characters/:projectId/search")
  @Summary("Search characters")
  @Description("Search characters by semantic similarity")
  async searchCharacters(
    @PathParams("projectId") projectId: string,
    @QueryParams("query") query: string,
    @QueryParams("limit") limit: number = 5
  ): Promise<{ results: CharacterDTO[] }> {
    // This would call Qdrant through the orchestrator
    // For now, return from Supabase with basic filtering
    const characters = await this.supabaseService.getCharacters(projectId);
    const characterDTOs = characters.map(mapCharacterToDTO);
    const filtered = characterDTOs.filter(c => 
      c.name?.toLowerCase().includes(query.toLowerCase()) ||
      c.archetype?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, limit);
    
    return { results: filtered };
  }

  @Get("/worldbuilding/:projectId")
  @Summary("Get worldbuilding elements")
  @Description("Retrieve all worldbuilding elements for a project")
  async getWorldbuilding(
    @PathParams("projectId") projectId: string,
    @QueryParams("type") elementType?: string
  ): Promise<{ elements: WorldbuildingDTO[]; count: number }> {
    const elements = await this.supabaseService.getWorldbuilding(projectId, elementType);
    const elementDTOs = elements.map(e => mapWorldbuildingToDTO(e as {
      id: string;
      project_id: string;
      element_type: string;
      name: string;
      description: string;
      attributes?: unknown;
      qdrant_id?: string;
      created_at: string;
    }));
    return {
      elements: elementDTOs,
      count: elements.length,
    };
  }

  @Get("/scenes/:projectId")
  @Summary("Get project scenes")
  @Description("Retrieve all scene drafts for a project")
  async getScenes(
    @PathParams("projectId") projectId: string
  ): Promise<{ scenes: DraftDTO[]; count: number }> {
    const drafts = await this.supabaseService.getDrafts(projectId);
    const sceneDTOs = drafts.map(mapDraftToDTO);
    return {
      scenes: sceneDTOs,
      count: drafts.length,
    };
  }

  @Get("/scenes/:projectId/:sceneNumber")
  @Summary("Get specific scene")
  @Description("Retrieve a specific scene draft")
  async getScene(
    @PathParams("projectId") projectId: string,
    @PathParams("sceneNumber") sceneNumber: number
  ): Promise<DraftDTO> {
    const drafts = await this.supabaseService.getDrafts(projectId);
    const sceneDTOs = drafts.map(mapDraftToDTO);
    const scene = sceneDTOs.find(d => d.sceneNumber === sceneNumber);
    
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
  ): Promise<OutlineDTO> {
    const outline = await this.supabaseService.getOutline(projectId);
    
    if (!outline) {
      throw new Error("Outline not found");
    }
    
    return mapOutlineToDTO(outline);
  }

  @Get("/critiques/:projectId")
  @Summary("Get scene critiques")
  @Description("Retrieve all critiques for a project")
  async getCritiques(
    @PathParams("projectId") projectId: string
  ): Promise<{ critiques: CritiqueDTO[]; count: number }> {
    const critiques = await this.supabaseService.getCritiques(projectId);
    const critiqueDTOs = critiques.map(c => mapCritiqueToDTO(c as {
      id: string;
      project_id: string;
      scene_number: number;
      overall_score?: number;
      feedback?: string;
      suggestions?: unknown[];
      created_at: string;
    }));
    return {
      critiques: critiqueDTOs,
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
  ): Promise<{ logs: AuditLogDTO[]; count: number }> {
    const logs = await this.supabaseService.getAuditLogs(projectId, agentName, limit);
    const logDTOs = logs.map(l => mapAuditLogToDTO(l as {
      id: string;
      project_id: string;
      agent_name: string;
      action: string;
      input_summary?: string;
      output_summary?: string;
      token_usage?: unknown;
      duration_ms?: number;
      created_at: string;
    }));
    return {
      logs: logDTOs,
      count: logs.length,
    };
  }
}
