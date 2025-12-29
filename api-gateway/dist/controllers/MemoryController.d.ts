export declare class MemoryController {
    private supabaseService;
    getCharacters(projectId: string): Promise<{
        characters: unknown[];
        count: number;
    }>;
    searchCharacters(projectId: string, query: string, limit?: number): Promise<{
        results: unknown[];
    }>;
    getWorldbuilding(projectId: string, elementType?: string): Promise<{
        elements: unknown[];
        count: number;
    }>;
    getScenes(projectId: string): Promise<{
        scenes: unknown[];
        count: number;
    }>;
    getScene(projectId: string, sceneNumber: number): Promise<unknown>;
    getOutline(projectId: string): Promise<unknown>;
    getCritiques(projectId: string): Promise<{
        critiques: unknown[];
        count: number;
    }>;
    getAuditLogs(projectId: string, agentName?: string, limit?: number): Promise<{
        logs: unknown[];
        count: number;
    }>;
}
//# sourceMappingURL=MemoryController.d.ts.map