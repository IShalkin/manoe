/**
 * State Controller
 *
 * Provides API endpoints for querying generation state graph
 */
import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";
import { GenerationPhase } from "../models/LLMModels";
/**
 * State graph response
 */
interface StateGraphResponse {
    currentState: {
        id: string;
        phase: GenerationPhase;
        status: string;
        agent: string;
    };
    nextStates: Array<{
        id: string;
        phase: GenerationPhase;
        agent: string;
    }>;
    allStates: Array<{
        id: string;
        phase: GenerationPhase;
        status: string;
        agent: string;
    }>;
}
export declare class StateController {
    private orchestrator;
    constructor(orchestrator: StorytellerOrchestrator);
    /**
     * Get current state graph for a run
     */
    getStateGraph(runId: string): Promise<StateGraphResponse>;
}
export {};
//# sourceMappingURL=StateController.d.ts.map