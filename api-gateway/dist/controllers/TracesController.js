"use strict";
/**
 * Traces Controller
 *
 * Provides API endpoints for querying Langfuse traces
 */
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
exports.TracesController = void 0;
const common_1 = require("@tsed/common");
const di_1 = require("@tsed/di");
const LangfuseService_1 = require("../services/LangfuseService");
let TracesController = class TracesController {
    langfuse;
    constructor(langfuse) {
        this.langfuse = langfuse;
    }
    /**
     * Get trace tree for a run
     */
    async getTraces(runId) {
        // Note: This is a simplified implementation
        // In production, LangfuseService would need a method to fetch traces
        // For now, return a placeholder structure
        if (!this.langfuse.isEnabled) {
            return null;
        }
        // Build trace tree structure
        // This would typically fetch from Langfuse API
        const traceTree = {
            id: runId,
            name: `Generation Run ${runId}`,
            type: "trace",
            startTime: new Date().toISOString(),
            children: [],
        };
        return traceTree;
    }
};
exports.TracesController = TracesController;
__decorate([
    (0, common_1.Get)("/"),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TracesController.prototype, "getTraces", null);
exports.TracesController = TracesController = __decorate([
    (0, common_1.Controller)("/runs/:runId/traces"),
    __param(0, (0, di_1.Inject)()),
    __metadata("design:paramtypes", [LangfuseService_1.LangfuseService])
], TracesController);
//# sourceMappingURL=TracesController.js.map