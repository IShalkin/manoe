"use strict";
/**
 * State Controller
 *
 * Provides API endpoints for querying generation state graph
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
exports.StateController = void 0;
const common_1 = require("@tsed/common");
const di_1 = require("@tsed/di");
const StorytellerOrchestrator_1 = require("../services/StorytellerOrchestrator");
const StateGraph_1 = require("../models/StateGraph");
let StateController = class StateController {
    orchestrator;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Get current state graph for a run
     */
    async getStateGraph(runId) {
        const runStatus = this.orchestrator.getRunStatus(runId);
        if (!runStatus) {
            throw new Error(`Run ${runId} not found`);
        }
        const currentStateNode = (0, StateGraph_1.getStateNodeByPhase)(runStatus.phase);
        if (!currentStateNode) {
            throw new Error(`No state node found for phase: ${runStatus.phase}`);
        }
        // Build context for transition evaluation
        const state = this.orchestrator.getRunState(runId);
        const context = {
            revision_needed: false, // Default, will be updated from critique if available
        };
        // Get latest critique for current scene if available
        if (state && state.currentScene > 0) {
            const critiques = state.critiques.get(state.currentScene);
            if (critiques && critiques.length > 0) {
                const latestCritique = critiques[critiques.length - 1];
                context.revision_needed = latestCritique.revision_needed ?? false;
            }
        }
        const nextStates = (0, StateGraph_1.getNextStates)(currentStateNode.id, context);
        // Build all states with their current status
        const allStates = StateGraph_1.GENERATION_GRAPH.map((node) => {
            let status = "pending";
            if (node.id === currentStateNode.id) {
                status = runStatus.isCompleted ? "completed" : runStatus.isPaused ? "pending" : "active";
            }
            else if (StateGraph_1.GENERATION_GRAPH.findIndex((n) => n.id === node.id) < StateGraph_1.GENERATION_GRAPH.findIndex((n) => n.id === currentStateNode.id)) {
                status = "completed";
            }
            return {
                id: node.id,
                phase: node.phase,
                status,
                agent: node.agent,
            };
        });
        return {
            currentState: {
                id: currentStateNode.id,
                phase: currentStateNode.phase,
                status: runStatus.isCompleted ? "completed" : runStatus.isPaused ? "pending" : "active",
                agent: currentStateNode.agent,
            },
            nextStates: nextStates.map((node) => ({
                id: node.id,
                phase: node.phase,
                agent: node.agent,
            })),
            allStates,
        };
    }
};
exports.StateController = StateController;
__decorate([
    (0, common_1.Get)("/graph"),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StateController.prototype, "getStateGraph", null);
exports.StateController = StateController = __decorate([
    (0, common_1.Controller)("/runs/:runId/state"),
    __param(0, (0, di_1.Inject)()),
    __metadata("design:paramtypes", [StorytellerOrchestrator_1.StorytellerOrchestrator])
], StateController);
//# sourceMappingURL=StateController.js.map