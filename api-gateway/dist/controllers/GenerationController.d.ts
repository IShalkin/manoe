export declare class GenerationController {
    private jobQueueService;
    private supabaseService;
    generateCharacters(projectId: string, options?: {
        regenerate?: boolean;
    }): Promise<{
        jobId: string;
        message: string;
    }>;
    generateOutline(projectId: string, options?: {
        preferredStructure?: string;
        targetWordCount?: number;
        estimatedScenes?: number;
    }): Promise<{
        jobId: string;
        message: string;
    }>;
    generateDraft(projectId: string, options?: {
        sceneNumber?: number;
        allScenes?: boolean;
    }): Promise<{
        jobId: string;
        message: string;
    }>;
    requestCritique(projectId: string, options?: {
        sceneNumber?: number;
        allScenes?: boolean;
    }): Promise<{
        jobId: string;
        message: string;
    }>;
    getJobStatus(jobId: string): Promise<{
        status: string;
        result?: unknown;
    }>;
    getQueueStats(): Promise<{
        pending: number;
        processing: number;
        completed: number;
        failed: number;
    }>;
}
//# sourceMappingURL=GenerationController.d.ts.map