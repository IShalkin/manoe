import { Request, Response } from "express";
interface StreamEvent {
    id: string;
    type: string;
    runId: string;
    timestamp: string;
    data: Record<string, unknown>;
}
export declare class EventsController {
    private redisClient;
    constructor();
    private connect;
    private getClient;
    streamEvents(runId: string, req: Request, res: Response): Promise<void>;
    getEventHistory(runId: string): Promise<{
        events: StreamEvent[];
    }>;
    healthCheck(): Promise<{
        status: string;
        redis: string;
    }>;
    private sendEvent;
    private sleep;
}
export {};
//# sourceMappingURL=EventsController.d.ts.map