import type { Request } from "express";
import { ConsistencyReport, GlobalConsistencyReport } from "../utils/dataConsistencyChecker";
interface HealthStatus {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    version: string;
    services: {
        api: ServiceStatus;
        redis: ServiceStatus;
        supabase: ServiceStatus;
        qdrant: ServiceStatus;
    };
    environment?: {
        status: "healthy" | "degraded" | "unhealthy";
        missingRequired: string[];
        warnings: string[];
    };
}
interface ServiceStatus {
    status: "up" | "down" | "unknown";
    latencyMs?: number;
    error?: string;
}
export declare class HealthController {
    private jobQueueService;
    private supabaseService;
    private qdrantMemoryService;
    healthCheck(): Promise<{
        status: string;
        timestamp: string;
    }>;
    detailedHealthCheck(): Promise<HealthStatus>;
    readinessCheck(): Promise<{
        ready: boolean;
        checks: Record<string, boolean>;
    }>;
    livenessCheck(): Promise<{
        alive: boolean;
    }>;
    private checkRedis;
    private checkSupabase;
    private checkQdrant;
    checkProjectConsistency(projectId: string): Promise<ConsistencyReport>;
    checkGlobalConsistency(): Promise<GlobalConsistencyReport>;
    repairProjectConsistency(projectId: string, req: Request): Promise<{
        repairedCharacters: number;
        repairedWorldbuilding: number;
        repairedScenes: number;
        errors: string[];
    }>;
}
export {};
//# sourceMappingURL=HealthController.d.ts.map