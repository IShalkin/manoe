interface DynamicModel {
    id: string;
    name: string;
    context_length?: number;
    description?: string;
}
interface FetchModelsRequest {
    provider: string;
    api_key: string;
}
interface FetchModelsResponse {
    success: boolean;
    models?: DynamicModel[];
    error?: string;
}
export declare class DynamicModelsController {
    fetchModels(body: FetchModelsRequest): Promise<FetchModelsResponse>;
    private fetchModelsFromProvider;
    private fetchOpenAIModels;
    private fetchOpenRouterModels;
    private fetchAnthropicModels;
    private fetchGeminiModels;
    private fetchDeepSeekModels;
    private fetchVeniceModels;
    private formatModelName;
    private getOpenAIContextLength;
}
export {};
//# sourceMappingURL=DynamicModelsController.d.ts.map