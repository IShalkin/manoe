import { ResearchHistoryItem } from "../services/SupabaseService";
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