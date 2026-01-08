"use strict";
/**
 * Feedback Controller for MANOE
 * Handles user feedback (thumbs up/down) for quality evaluation
 *
 * Features:
 * - Explicit feedback (thumbs up/down) on agent outputs
 * - Implicit feedback tracking (regeneration requests)
 * - Integration with Langfuse for quality scoring
 * - Integration with Prometheus metrics
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
exports.FeedbackController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const LangfuseService_1 = require("../services/LangfuseService");
const MetricsService_1 = require("../services/MetricsService");
let FeedbackController = class FeedbackController {
    langfuseService;
    metricsService;
    async submitFeedback(body) {
        const { runId, projectId, agentName, feedbackType, sceneNumber, comment } = body;
        if (!runId || !agentName || !feedbackType) {
            return {
                success: false,
                message: "Missing required fields: runId, agentName, feedbackType",
            };
        }
        if (feedbackType !== "thumbs_up" && feedbackType !== "thumbs_down") {
            return {
                success: false,
                message: "feedbackType must be 'thumbs_up' or 'thumbs_down'",
            };
        }
        try {
            // Record feedback in Langfuse for quality tracking
            this.langfuseService.recordUserFeedback(runId, feedbackType, agentName, sceneNumber, comment);
            // Record feedback in Prometheus metrics
            this.metricsService.recordUserFeedback(feedbackType, agentName);
            const feedbackId = `${runId}-${agentName}-${Date.now()}`;
            console.log(`[FeedbackController] Recorded ${feedbackType} for ${agentName} in run ${runId}` +
                (sceneNumber ? ` (scene ${sceneNumber})` : ""));
            return {
                success: true,
                message: `Feedback recorded successfully`,
                feedbackId,
            };
        }
        catch (error) {
            console.error("[FeedbackController] Error recording feedback:", error);
            return {
                success: false,
                message: `Failed to record feedback: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
        }
    }
    async recordRegeneration(body) {
        const { runId, projectId, agentName, sceneNumber, reason } = body;
        if (!runId || !agentName) {
            return {
                success: false,
                message: "Missing required fields: runId, agentName",
            };
        }
        try {
            // Record regeneration in Langfuse as implicit negative feedback
            this.langfuseService.recordRegenerationRequest(runId, agentName, sceneNumber, reason);
            // Record regeneration in Prometheus metrics
            this.metricsService.recordRegenerationRequest(agentName, sceneNumber);
            console.log(`[FeedbackController] Recorded regeneration for ${agentName} in run ${runId}` +
                (sceneNumber ? ` (scene ${sceneNumber})` : "") +
                (reason ? `: ${reason}` : ""));
            return {
                success: true,
                message: "Regeneration request recorded as implicit feedback",
            };
        }
        catch (error) {
            console.error("[FeedbackController] Error recording regeneration:", error);
            return {
                success: false,
                message: `Failed to record regeneration: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
        }
    }
    async submitQualityScore(body) {
        const { runId, agentName, scoreType, value, comment } = body;
        if (!runId || !agentName || !scoreType || value === undefined) {
            return {
                success: false,
                message: "Missing required fields: runId, agentName, scoreType, value",
            };
        }
        if (value < 0 || value > 1) {
            return {
                success: false,
                message: "value must be between 0 and 1",
            };
        }
        try {
            if (scoreType === "faithfulness") {
                this.langfuseService.scoreFaithfulness(runId, value, agentName, comment);
            }
            else if (scoreType === "relevance") {
                this.langfuseService.scoreRelevance(runId, value, agentName, comment);
            }
            console.log(`[FeedbackController] Recorded ${scoreType} score ${value} for ${agentName} in run ${runId}`);
            return {
                success: true,
                message: `Quality score recorded successfully`,
            };
        }
        catch (error) {
            console.error("[FeedbackController] Error recording quality score:", error);
            return {
                success: false,
                message: `Failed to record quality score: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
        }
    }
};
exports.FeedbackController = FeedbackController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", LangfuseService_1.LangfuseService)
], FeedbackController.prototype, "langfuseService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", MetricsService_1.MetricsService)
], FeedbackController.prototype, "metricsService", void 0);
__decorate([
    (0, common_1.Post)("/"),
    (0, schema_1.Summary)("Submit user feedback"),
    (0, schema_1.Description)("Submit thumbs up/down feedback for an agent output"),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(400),
    __param(0, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FeedbackController.prototype, "submitFeedback", null);
__decorate([
    (0, common_1.Post)("/regeneration"),
    (0, schema_1.Summary)("Record regeneration request"),
    (0, schema_1.Description)("Record a regeneration request as implicit negative feedback"),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(400),
    __param(0, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FeedbackController.prototype, "recordRegeneration", null);
__decorate([
    (0, common_1.Post)("/quality-score"),
    (0, schema_1.Summary)("Submit quality score"),
    (0, schema_1.Description)("Submit a quality score (faithfulness or relevance) for an agent output"),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(400),
    __param(0, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FeedbackController.prototype, "submitQualityScore", null);
exports.FeedbackController = FeedbackController = __decorate([
    (0, common_1.Controller)("/feedback"),
    (0, schema_1.Tags)("Feedback"),
    (0, schema_1.Description)("User feedback endpoints for quality evaluation")
], FeedbackController);
//# sourceMappingURL=FeedbackController.js.map