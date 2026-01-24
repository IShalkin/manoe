"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const common_2 = require("@tsed/common");
const exceptions_1 = require("@tsed/exceptions");
const JobQueueService_1 = require("../services/JobQueueService");
const SupabaseService_1 = require("../services/SupabaseService");
const QdrantMemoryService_1 = require("../services/QdrantMemoryService");
const envValidation_1 = require("../utils/envValidation");
const dataConsistencyChecker_1 = require("../utils/dataConsistencyChecker");
const AuthMiddleware_1 = require("../middleware/AuthMiddleware");
let HealthController = class HealthController {
    jobQueueService;
    supabaseService;
    qdrantMemoryService;
    async healthCheck() {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
        };
    }
    async detailedHealthCheck() {
        const services = {
            api: { status: "up" },
            redis: await this.checkRedis(),
            supabase: await this.checkSupabase(),
            qdrant: await this.checkQdrant(),
        };
        // Get environment validation status
        const envHealth = (0, envValidation_1.getEnvHealthStatus)();
        const allServicesUp = Object.values(services).every((s) => s.status === "up");
        const anyServiceDown = Object.values(services).some((s) => s.status === "down");
        // Overall status considers both services and environment
        let overallStatus;
        if (anyServiceDown || envHealth.status === "unhealthy") {
            overallStatus = "unhealthy";
        }
        else if (!allServicesUp || envHealth.status === "degraded") {
            overallStatus = "degraded";
        }
        else {
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
    async readinessCheck() {
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
    async livenessCheck() {
        return { alive: true };
    }
    async checkRedis() {
        try {
            const start = Date.now();
            await this.jobQueueService.ping();
            return {
                status: "up",
                latencyMs: Date.now() - start,
            };
        }
        catch (error) {
            return {
                status: "down",
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async checkSupabase() {
        try {
            const start = Date.now();
            await this.supabaseService.healthCheck();
            return {
                status: "up",
                latencyMs: Date.now() - start,
            };
        }
        catch (error) {
            return {
                status: "down",
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async checkQdrant() {
        // Qdrant is accessed through the orchestrator
        // For now, return unknown status
        return {
            status: "unknown",
        };
    }
    async checkProjectConsistency(projectId) {
        const checker = (0, dataConsistencyChecker_1.createDataConsistencyChecker)(this.supabaseService, this.qdrantMemoryService);
        return checker.checkProjectConsistency(projectId);
    }
    async checkGlobalConsistency() {
        const checker = (0, dataConsistencyChecker_1.createDataConsistencyChecker)(this.supabaseService, this.qdrantMemoryService);
        return checker.checkGlobalConsistency();
    }
    async repairProjectConsistency(projectId, req) {
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
        AuthMiddleware_1.AuthMiddleware.requireAuth(req);
        // Fetch project (filtered by RLS based on user's JWT)
        const project = await this.supabaseService.getProject(projectId);
        if (!project) {
            throw new exceptions_1.NotFound("Project not found or access denied");
        }
        // Explicit ownership verification (defense-in-depth)
        // This will re-verify auth and check ownership
        AuthMiddleware_1.AuthMiddleware.verifyOwnership(req, project);
        const checker = (0, dataConsistencyChecker_1.createDataConsistencyChecker)(this.supabaseService, this.qdrantMemoryService);
        return checker.repairMissingEmbeddings(projectId);
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", JobQueueService_1.JobQueueService)
], HealthController.prototype, "jobQueueService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", SupabaseService_1.SupabaseService)
], HealthController.prototype, "supabaseService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", QdrantMemoryService_1.QdrantMemoryService)
], HealthController.prototype, "qdrantMemoryService", void 0);
__decorate([
    (0, common_1.Get)("/"),
    (0, schema_1.Summary)("Basic health check"),
    (0, schema_1.Description)("Returns basic health status"),
    (0, schema_1.Returns)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "healthCheck", null);
__decorate([
    (0, common_1.Get)("/detailed"),
    (0, schema_1.Summary)("Detailed health check"),
    (0, schema_1.Description)("Returns detailed health status including all services and environment validation"),
    (0, schema_1.Returns)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "detailedHealthCheck", null);
__decorate([
    (0, common_1.Get)("/ready"),
    (0, schema_1.Summary)("Readiness check"),
    (0, schema_1.Description)("Check if the service is ready to accept traffic"),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(503),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "readinessCheck", null);
__decorate([
    (0, common_1.Get)("/live"),
    (0, schema_1.Summary)("Liveness check"),
    (0, schema_1.Description)("Check if the service is alive"),
    (0, schema_1.Returns)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "livenessCheck", null);
__decorate([
    (0, common_1.Get)("/consistency/:projectId"),
    (0, schema_1.Summary)("Check data consistency for a project"),
    (0, schema_1.Description)("Verifies consistency between Supabase and Qdrant data for a specific project"),
    (0, schema_1.Returns)(200),
    __param(0, (0, common_1.PathParams)("projectId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkProjectConsistency", null);
__decorate([
    (0, common_1.Get)("/consistency"),
    (0, schema_1.Summary)("Check global data consistency"),
    (0, schema_1.Description)("Verifies consistency between Supabase and Qdrant data for all projects"),
    (0, schema_1.Returns)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkGlobalConsistency", null);
__decorate([
    (0, common_1.Post)("/consistency/:projectId/repair"),
    (0, schema_1.Summary)("Repair missing embeddings for a project"),
    (0, schema_1.Description)("Re-indexes entities that are missing Qdrant embeddings. Requires project ownership."),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(404),
    (0, schema_1.Returns)(401),
    (0, schema_1.Returns)(403),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_2.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "repairProjectConsistency", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)("/health"),
    (0, schema_1.Tags)("Health"),
    (0, schema_1.Description)("Health check endpoints")
], HealthController);
//# sourceMappingURL=HealthController.js.map