/**
 * Traces Controller
 *
 * Provides API endpoints for querying Langfuse traces
 */
import { LangfuseService } from "../services/LangfuseService";
/**
 * Trace tree node
 */
interface TraceTreeNode {
    id: string;
    name: string;
    type: "trace" | "span" | "generation";
    startTime: string;
    endTime?: string;
    latencyMs?: number;
    model?: string;
    provider?: string;
    input?: unknown;
    output?: unknown;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    children: TraceTreeNode[];
}
export declare class TracesController {
    private langfuse;
    constructor(langfuse: LangfuseService);
    /**
     * Get trace tree for a run
     */
    getTraces(runId: string): Promise<TraceTreeNode | null>;
}
export {};
//# sourceMappingURL=TracesController.d.ts.map