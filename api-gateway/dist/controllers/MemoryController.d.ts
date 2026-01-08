import { CharacterDTO, DraftDTO, OutlineDTO, WorldbuildingDTO, CritiqueDTO, AuditLogDTO } from "../utils/entityMappers";
export declare class MemoryController {
    private supabaseService;
    getCharacters(projectId: string): Promise<{
        characters: CharacterDTO[];
        count: number;
    }>;
    searchCharacters(projectId: string, query: string, limit?: number): Promise<{
        results: CharacterDTO[];
    }>;
    getWorldbuilding(projectId: string, elementType?: string): Promise<{
        elements: WorldbuildingDTO[];
        count: number;
    }>;
    getScenes(projectId: string): Promise<{
        scenes: DraftDTO[];
        count: number;
    }>;
    getScene(projectId: string, sceneNumber: number): Promise<DraftDTO>;
    getOutline(projectId: string): Promise<OutlineDTO>;
    getCritiques(projectId: string): Promise<{
        critiques: CritiqueDTO[];
        count: number;
    }>;
    getAuditLogs(projectId: string, agentName?: string, limit?: number): Promise<{
        logs: AuditLogDTO[];
        count: number;
    }>;
}
//# sourceMappingURL=MemoryController.d.ts.map