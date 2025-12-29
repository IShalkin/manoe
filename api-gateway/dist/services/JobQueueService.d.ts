interface JobPayload {
    jobId: string;
    projectId: string;
    phase: string;
    inputData: Record<string, unknown>;
    createdAt?: string;
    retryCount?: number;
    maxRetries?: number;
}
export declare class JobQueueService {
    private client;
    private readonly QUEUE_PENDING;
    private readonly QUEUE_PROCESSING;
    private readonly QUEUE_COMPLETED;
    private readonly QUEUE_FAILED;
    private readonly CHANNEL_PROJECT;
    private readonly CHANNEL_GENERATION;
    constructor();
    private connect;
    private getClient;
    ping(): Promise<string>;
    enqueueJob(job: JobPayload): Promise<string>;
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
    publishEvent(channel: string, event: Record<string, unknown>): Promise<void>;
    subscribe(channels: string[], callback: (channel: string, message: Record<string, unknown>) => void): Promise<void>;
    disconnect(): Promise<void>;
}
export {};
//# sourceMappingURL=JobQueueService.d.ts.map