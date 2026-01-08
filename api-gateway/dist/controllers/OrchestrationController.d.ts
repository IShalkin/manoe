/**
 * Orchestration Controller
 *
 * Handles the complete narrative generation flow using the StorytellerOrchestrator.
 * Implements the async pattern: POST -> 202 Accepted -> GET Stream (SSE)
 *
 * Flow:
 * 1. Client -> POST /orchestrate/generate -> Controller
 * 2. Controller -> StorytellerOrchestrator -> Redis Stream (Push "Start")
 * 3. Client receives 202 Accepted + RunID
 * 4. Client -> GET /orchestrate/stream/:runId (SSE subscription)
 * 5. Orchestrator -> LLM API -> Redis Stream (Push chunks)
 * 6. Client <- SSE (Real-time text streaming)
 * 7. Background: Langfuse logs everything asynchronously
 */
import { Request, Response } from "express";
import { RunStatus } from "../services/StorytellerOrchestrator";
import { LLMProvider, GenerationPhase } from "../models/LLMModels";
/**
 * LLM Configuration DTO
 * Uses @Groups to separate public and internal fields
 */
declare class LLMConfigDTO {
    provider: LLMProvider;
    model: string;
    apiKey: string;
    temperature?: number;
}
/**
 * Generation Request DTO - supports both new TypeScript format and legacy Python format
 */
declare class GenerateRequestDTO {
    projectId?: string;
    seedIdea?: string;
    llmConfig?: LLMConfigDTO;
    mode?: "full" | "branching";
    settings?: Record<string, unknown>;
    supabase_project_id?: string;
    seed_idea?: string;
    provider?: string;
    model?: string;
    api_key?: string;
    generation_mode?: "full" | "branching";
    embeddingApiKey?: string;
    embedding_api_key?: string;
}
/**
 * Generation Response DTO - includes both camelCase and snake_case for compatibility
 */
declare class GenerateResponseDTO {
    runId: string;
    run_id: string;
    success: boolean;
    message: string;
    streamUrl: string;
}
/**
 * Run Status DTO (public view)
 */
declare class RunStatusDTO {
    runId: string;
    projectId: string;
    phase: GenerationPhase;
    currentScene: number;
    totalScenes: number;
    isPaused: boolean;
    isCompleted: boolean;
    error?: string;
    startedAt: string;
    updatedAt: string;
}
export declare class OrchestrationController {
    private orchestrator;
    private redisStreams;
    /**
     * Start a new narrative generation
     */
    startGeneration(request: GenerateRequestDTO): Promise<GenerateResponseDTO>;
    /**
     * SSE Stream endpoint for real-time events
     */
    streamEvents(runId: string, req: Request, res: Response): Promise<void>;
    /**
     * SSE Stream endpoint (legacy route for Python orchestrator compatibility)
     */
    streamEventsLegacy(runId: string, token: string, req: Request, res: Response): Promise<void>;
    /**
     * Get run status
     */
    getStatus(runId: string): RunStatusDTO | {
        error: string;
    };
    /**
     * Pause a running generation
     */
    pauseRun(runId: string): {
        success: boolean;
        message: string;
    };
    /**
     * Resume a paused generation
     */
    resumeRun(runId: string): {
        success: boolean;
        message: string;
    };
    /**
     * Cancel a generation
     */
    cancelRun(runId: string): {
        success: boolean;
        message: string;
    };
    /**
     * Pause a running generation (legacy route)
     */
    pauseRunLegacy(runId: string): {
        success: boolean;
        message: string;
    };
    /**
     * Resume a paused generation (legacy route)
     */
    resumeRunLegacy(runId: string): {
        success: boolean;
        message: string;
    };
    /**
     * List all active runs
     */
    listRuns(): RunStatus[];
}
export {};
//# sourceMappingURL=OrchestrationController.d.ts.map