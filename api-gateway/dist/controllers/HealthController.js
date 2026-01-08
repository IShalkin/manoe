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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const JobQueueService_1 = require("../services/JobQueueService");
const SupabaseService_1 = require("../services/SupabaseService");
const envValidation_1 = require("../utils/envValidation");
let HealthController = class HealthController {
    jobQueueService;
    supabaseService;
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
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)("/health"),
    (0, schema_1.Tags)("Health"),
    (0, schema_1.Description)("Health check endpoints")
], HealthController);
//# sourceMappingURL=HealthController.js.map