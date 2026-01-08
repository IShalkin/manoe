"use strict";
/**
 * Metrics Controller for MANOE
 * Exposes Prometheus metrics endpoint for scraping
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
exports.MetricsController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const MetricsService_1 = require("../services/MetricsService");
let MetricsController = class MetricsController {
    metricsService;
    async getMetrics(res) {
        const metrics = await this.metricsService.getMetrics();
        res.set("Content-Type", this.metricsService.getContentType());
        res.send(metrics);
    }
};
exports.MetricsController = MetricsController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", MetricsService_1.MetricsService)
], MetricsController.prototype, "metricsService", void 0);
__decorate([
    (0, common_1.Get)("/"),
    (0, schema_1.Summary)("Get Prometheus metrics"),
    (0, schema_1.Description)("Returns all metrics in Prometheus text format for scraping"),
    (0, schema_1.Returns)(200, String),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MetricsController.prototype, "getMetrics", null);
exports.MetricsController = MetricsController = __decorate([
    (0, common_1.Controller)("/metrics"),
    (0, schema_1.Tags)("Metrics"),
    (0, schema_1.Description)("Prometheus metrics endpoint")
], MetricsController);
//# sourceMappingURL=MetricsController.js.map