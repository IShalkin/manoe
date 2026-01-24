import { Controller, Get, PathParams, Post } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { Req } from "@tsed/common";
import type { Request } from "express";
import { JobQueueService } from "../services/JobQueueService";
import { SupabaseService } from "../services/SupabaseService";
import { QdrantMemoryService } from "../services/QdrantMemoryService";
import { getEnvHealthStatus } from "../utils/envValidation";
import { createDataConsistencyChecker, ConsistencyReport, GlobalConsistencyReport } from "../utils/dataConsistencyChecker";
import { AuthMiddleware } from "../middleware/AuthMiddleware";

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

@Controller("/health")
@Tags("Health")
@Description("Health check endpoints")
export class HealthController {
  @Inject()
  private jobQueueService: JobQueueService;

  @Inject()
  private supabaseService: SupabaseService;

  @Inject()
  private qdrantMemoryService: QdrantMemoryService;

  @Get("/")
  @Summary("Basic health check")
  @Description("Returns basic health status")
  @Returns(200)
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("/detailed")
  @Summary("Detailed health check")
  @Description("Returns detailed health status including all services and environment validation")
  @Returns(200)
  async detailedHealthCheck(): Promise<HealthStatus> {
    const services = {
      api: { status: "up" as const },
      redis: await this.checkRedis(),
      supabase: await this.checkSupabase(),
      qdrant: await this.checkQdrant(),
    };

    // Get environment validation status
    const envHealth = getEnvHealthStatus();

    const allServicesUp = Object.values(services).every((s) => s.status === "up");
    const anyServiceDown = Object.values(services).some((s) => s.status === "down");

    // Overall status considers both services and environment
    let overallStatus: "healthy" | "degraded" | "unhealthy";
    if (anyServiceDown || envHealth.status === "unhealthy") {
      overallStatus = "unhealthy";
    } else if (!allServicesUp || envHealth.status === "degraded") {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.1.0",
      services,
      environment: {
        status: envHealth.status,
        missingRequired: envHealth.details.missingRequired,
        warnings: envHealth.details.warnings,
      },
    };
  }

  @Get("/ready")
  @Summary("Readiness check")
  @Description("Check if the service is ready to accept traffic")
  @Returns(200)
  @Returns(503)
  async readinessCheck(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
    const checks = {
      redis: (await this.checkRedis()).status === "up",
      supabase: (await this.checkSupabase()).status === "up",
    };

    const ready = Object.values(checks).every((c) => c);

    if (!ready) {
      throw new Error("Service not ready");
    }

    return { ready, checks };
  }

  @Get("/live")
  @Summary("Liveness check")
  @Description("Check if the service is alive")
  @Returns(200)
  async livenessCheck(): Promise<{ alive: boolean }> {
    return { alive: true };
  }

  private async checkRedis(): Promise<ServiceStatus> {
    try {
      const start = Date.now();
      await this.jobQueueService.ping();
      return {
        status: "up",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkSupabase(): Promise<ServiceStatus> {
    try {
      const start = Date.now();
      await this.supabaseService.healthCheck();
      return {
        status: "up",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkQdrant(): Promise<ServiceStatus> {
    // Qdrant is accessed through the orchestrator
    // For now, return unknown status
    return {
      status: "unknown",
    };
  }

  @Get("/consistency/:projectId")
  @Summary("Check data consistency for a project")
  @Description("Verifies consistency between Supabase and Qdrant data for a specific project")
  @Returns(200)
  async checkProjectConsistency(
    @PathParams("projectId") projectId: string
  ): Promise<ConsistencyReport> {
    const checker = createDataConsistencyChecker(
      this.supabaseService,
      this.qdrantMemoryService
    );
    return checker.checkProjectConsistency(projectId);
  }

  @Get("/consistency")
  @Summary("Check global data consistency")
  @Description("Verifies consistency between Supabase and Qdrant data for all projects")
  @Returns(200)
  async checkGlobalConsistency(): Promise<GlobalConsistencyReport> {
    const checker = createDataConsistencyChecker(
      this.supabaseService,
      this.qdrantMemoryService
    );
    return checker.checkGlobalConsistency();
  }

  @Post("/consistency/:projectId/repair")
  @Summary("Repair missing embeddings for a project")
  @Description("Re-indexes entities that are missing Qdrant embeddings. Requires project ownership.")
  @Returns(200)
  @Returns(404)
  @Returns(401)
  @Returns(403)
  async repairProjectConsistency(
    @PathParams("projectId") projectId: string,
    @Req() req: Request
  ): Promise<{
    repairedCharacters: number;
    repairedWorldbuilding: number;
    repairedScenes: number;
    errors: string[];
  }> {
    // SECURITY: Defense-in-depth authorization
    // 
    // Layer 1 (Database): Supabase RLS (Row Level Security) policies filter results
    // based on the authenticated user's JWT token. If the user doesn't own the project,
    // getProject() returns null (RLS filters it out).
    //
    // Layer 2 (Application): Explicit user ownership verification at the application layer.
    // This provides defense-in-depth security in case RLS policies are misconfigured
    // or bypassed. We extract user_id from the JWT and explicitly verify it matches
    // the project's user_id.
    //
    // Benefits of defense-in-depth:
    // - Protection against RLS policy bugs or misconfigurations
    // - Clear audit trail of authorization checks
    // - Explicit error messages for debugging
    // - Complies with security best practices
    
    // Extract user context from JWT (set by AuthMiddleware)
    // We don't need to store the return value since verifyOwnership will call requireAuth internally
    AuthMiddleware.requireAuth(req);

    // Fetch project (filtered by RLS based on user's JWT)
    const project = await this.supabaseService.getProject(projectId);
    if (!project) {
      throw new Error("Project not found or access denied");
    }

    // Explicit ownership verification (defense-in-depth)
    // This will re-verify auth and check ownership
    AuthMiddleware.verifyOwnership(req, project);

    const checker = createDataConsistencyChecker(
      this.supabaseService,
      this.qdrantMemoryService
    );
    return checker.repairMissingEmbeddings(projectId);
  }
}
