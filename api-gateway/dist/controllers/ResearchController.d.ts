interface ResearchHistoryItem {
    id: string;
    provider: string;
    model?: string;
    seed_idea: string;
    target_audience?: string;
    themes?: string[];
    moral_compass?: string;
    content: string;
    prompt_context?: string;
    citations?: Array<{
        url: string;
        title?: string;
    }>;
    created_at: string;
}
interface ResearchHistoryResponse {
    success: boolean;
    research: ResearchHistoryItem[];
    error?: string;
}
interface ResearchDetailResponse {
    success: boolean;
    research?: ResearchHistoryItem;
    error?: string;
}
export declare class ResearchController {
    private supabaseService;
    getResearchHistory(limit?: number): Promise<ResearchHistoryResponse>;
    getResearchResult(id: string): Promise<ResearchDetailResponse>;
}
export {};
//# sourceMappingURL=ResearchController.d.ts.map