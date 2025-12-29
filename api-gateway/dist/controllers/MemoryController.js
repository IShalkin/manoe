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
exports.MemoryController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const SupabaseService_1 = require("../services/SupabaseService");
let MemoryController = class MemoryController {
    supabaseService;
    async getCharacters(projectId) {
        const characters = await this.supabaseService.getCharacters(projectId);
        return {
            characters,
            count: characters.length,
        };
    }
    async searchCharacters(projectId, query, limit = 5) {
        // This would call Qdrant through the orchestrator
        // For now, return from Supabase with basic filtering
        const characters = await this.supabaseService.getCharacters(projectId);
        const filtered = characters.filter((c) => c.name?.toLowerCase().includes(query.toLowerCase()) ||
            c.archetype?.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
        return { results: filtered };
    }
    async getWorldbuilding(projectId, elementType) {
        const elements = await this.supabaseService.getWorldbuilding(projectId, elementType);
        return {
            elements,
            count: elements.length,
        };
    }
    async getScenes(projectId) {
        const drafts = await this.supabaseService.getDrafts(projectId);
        return {
            scenes: drafts,
            count: drafts.length,
        };
    }
    async getScene(projectId, sceneNumber) {
        const drafts = await this.supabaseService.getDrafts(projectId);
        const scene = drafts.find((d) => d.scene_number === sceneNumber);
        if (!scene) {
            throw new Error(`Scene ${sceneNumber} not found`);
        }
        return scene;
    }
    async getOutline(projectId) {
        const outline = await this.supabaseService.getOutline(projectId);
        if (!outline) {
            throw new Error("Outline not found");
        }
        return outline;
    }
    async getCritiques(projectId) {
        const critiques = await this.supabaseService.getCritiques(projectId);
        return {
            critiques,
            count: critiques.length,
        };
    }
    async getAuditLogs(projectId, agentName, limit = 50) {
        const logs = await this.supabaseService.getAuditLogs(projectId, agentName, limit);
        return {
            logs,
            count: logs.length,
        };
    }
};
exports.MemoryController = MemoryController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", SupabaseService_1.SupabaseService)
], MemoryController.prototype, "supabaseService", void 0);
__decorate([
    (0, common_1.Get)("/characters/:projectId"),
    (0, schema_1.Summary)("Get project characters"),
    (0, schema_1.Description)("Retrieve all character profiles for a project"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getCharacters", null);
__decorate([
    (0, common_1.Get)("/characters/:projectId/search"),
    (0, schema_1.Summary)("Search characters"),
    (0, schema_1.Description)("Search characters by semantic similarity"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.QueryParams)("query")),
    __param(2, (0, common_1.QueryParams)("limit")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "searchCharacters", null);
__decorate([
    (0, common_1.Get)("/worldbuilding/:projectId"),
    (0, schema_1.Summary)("Get worldbuilding elements"),
    (0, schema_1.Description)("Retrieve all worldbuilding elements for a project"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.QueryParams)("type")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getWorldbuilding", null);
__decorate([
    (0, common_1.Get)("/scenes/:projectId"),
    (0, schema_1.Summary)("Get project scenes"),
    (0, schema_1.Description)("Retrieve all scene drafts for a project"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getScenes", null);
__decorate([
    (0, common_1.Get)("/scenes/:projectId/:sceneNumber"),
    (0, schema_1.Summary)("Get specific scene"),
    (0, schema_1.Description)("Retrieve a specific scene draft"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.PathParams)("sceneNumber")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getScene", null);
__decorate([
    (0, common_1.Get)("/outline/:projectId"),
    (0, schema_1.Summary)("Get plot outline"),
    (0, schema_1.Description)("Retrieve the plot outline for a project"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getOutline", null);
__decorate([
    (0, common_1.Get)("/critiques/:projectId"),
    (0, schema_1.Summary)("Get scene critiques"),
    (0, schema_1.Description)("Retrieve all critiques for a project"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getCritiques", null);
__decorate([
    (0, common_1.Get)("/audit/:projectId"),
    (0, schema_1.Summary)("Get audit logs"),
    (0, schema_1.Description)("Retrieve agent audit logs for a project"),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.QueryParams)("agent")),
    __param(2, (0, common_1.QueryParams)("limit")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getAuditLogs", null);
exports.MemoryController = MemoryController = __decorate([
    (0, common_1.Controller)("/memory"),
    (0, schema_1.Tags)("Memory"),
    (0, schema_1.Description)("Vector memory retrieval endpoints")
], MemoryController);
//# sourceMappingURL=MemoryController.js.map