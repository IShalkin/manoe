import { Controller, Get, QueryParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";

@Controller("/research")
@Tags("Research")
@Description("Research history and management")
export class ResearchController {
  @Get("/history")
  @Summary("Get research history")
  @Description("Returns the history of research queries with optional limit")
  async getResearchHistory(
    @QueryParams("limit") limit?: number
  ): Promise<{ success: boolean; research: unknown[] }> {
    // For now, return empty array - research history is stored in Supabase
    // and should be fetched from there in a future implementation
    console.log(`[ResearchController] Getting research history with limit: ${limit || 20}`);
    
    return {
      success: true,
      research: [],
    };
  }
}
