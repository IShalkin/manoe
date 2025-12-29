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
exports.ResearchController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const SupabaseService_1 = require("../services/SupabaseService");
let ResearchController = class ResearchController {
    supabaseService;
    async getResearchHistory(limit = 20) {
        try {
            const research = await this.supabaseService.getResearchHistory(limit);
            return {
                success: true,
                research: research,
            };
        }
        catch (error) {
            console.error("[ResearchController] Error getting research history:", error);
            return {
                success: false,
                research: [],
                error: error instanceof Error ? error.message : "Failed to load research history",
            };
        }
    }
    async getResearchResult(id) {
        try {
            const research = await this.supabaseService.getResearchResult(id);
            if (!research) {
                return {
                    success: false,
                    error: "Research result not found",
                };
            }
            return {
                success: true,
                research: research,
            };
        }
        catch (error) {
            console.error("[ResearchController] Error getting research result:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Failed to load research result",
            };
        }
    }
};
exports.ResearchController = ResearchController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", SupabaseService_1.SupabaseService)
], ResearchController.prototype, "supabaseService", void 0);
__decorate([
    (0, common_1.Get)("/history"),
    (0, schema_1.Summary)("Get research history"),
    (0, schema_1.Description)("Retrieve past research results stored for Eternal Memory reuse"),
    (0, schema_1.Returns)(200),
    __param(0, (0, common_1.QueryParams)("limit")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "getResearchHistory", null);
__decorate([
    (0, common_1.Get)("/:id"),
    (0, schema_1.Summary)("Get research result by ID"),
    (0, schema_1.Description)("Retrieve a specific research result by its ID"),
    (0, schema_1.Returns)(200),
    __param(0, (0, common_1.PathParams)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ResearchController.prototype, "getResearchResult", null);
exports.ResearchController = ResearchController = __decorate([
    (0, common_1.Controller)("/research"),
    (0, schema_1.Tags)("Research"),
    (0, schema_1.Description)("Research history endpoints for Eternal Memory feature")
], ResearchController);
//# sourceMappingURL=ResearchController.js.map