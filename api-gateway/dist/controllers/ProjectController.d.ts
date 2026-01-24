import { StoryProjectDTO, ProjectResponseDTO, NarrativePossibilityDTO } from "../models/ProjectModels";
export declare class ProjectController {
    private jobQueueService;
    private supabaseService;
    private qdrantMemoryService;
    private cacheService;
    initProject(body: StoryProjectDTO): Promise<ProjectResponseDTO>;
    getProject(id: string): Promise<ProjectResponseDTO>;
    getNarrativePossibility(id: string): Promise<NarrativePossibilityDTO | null>;
    approvePhase(id: string, phase: string): Promise<ProjectResponseDTO>;
    listProjects(page?: number, limit?: number): Promise<{
        projects: ProjectResponseDTO[];
        total: number;
    }>;
    deleteProject(id: string): Promise<{
        success: boolean;
    }>;
    private _getPhaseInputData;
}
//# sourceMappingURL=ProjectController.d.ts.map