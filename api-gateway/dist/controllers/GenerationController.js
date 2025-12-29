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
exports.GenerationController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const JobQueueService_1 = require("../services/JobQueueService");
const SupabaseService_1 = require("../services/SupabaseService");
let GenerationController = class GenerationController {
    jobQueueService;
    supabaseService;
    async generateCharacters(projectId, options) {
        const project = await this.supabaseService.getProject(projectId);
        if (!project) {
            throw new Error("Project not found");
        }
        const narrative = await this.supabaseService.getNarrativePossibility(projectId);
        if (!narrative) {
            throw new Error("Narrative possibility not found. Complete Genesis phase first.");
        }
        const jobId = `characters-${projectId}-${Date.now()}`;
        await this.jobQueueService.enqueueJob({
            jobId,
            projectId,
            phase: "characters",
            inputData: {
                narrative_possibility: narrative,
                moral_compass: project.moral_compass,
                target_audience: project.target_audience,
                regenerate: options?.regenerate || false,
            },
        });
        await this.supabaseService.updateProjectStatus(projectId, "characters");
        return {
            jobId,
            message: "Character generation started",
        };
    }
    async generateOutline(projectId, options) {
        const project = await this.supabaseService.getProject(projectId);
        if (!project) {
            throw new Error("Project not found");
        }
        const narrative = await this.supabaseService.getNarrativePossibility(projectId);
        const characters = await this.supabaseService.getCharacters(projectId);
        if (!narrative || characters.length === 0) {
            throw new Error("Narrative and characters required. Complete previous phases first.");
        }
        const jobId = `outline-${projectId}-${Date.now()}`;
        await this.jobQueueService.enqueueJob({
            jobId,
            projectId,
            phase: "outlining",
            inputData: {
                narrative_possibility: narrative,
                characters,
                moral_compass: project.moral_compass,
                preferred_structure: options?.preferredStructure || "ThreeAct",
                target_word_count: options?.targetWordCount || 50000,
                estimated_scenes: options?.estimatedScenes || 20,
            },
        });
        await this.supabaseService.updateProjectStatus(projectId, "outlining");
        return {
            jobId,
            message: "Outline generation started",
        };
    }
    async generateDraft(projectId, options) {
        const project = await this.supabaseService.getProject(projectId);
        if (!project) {
            throw new Error("Project not found");
        }
        const outline = await this.supabaseService.getOutline(projectId);
        if (!outline) {
            throw new Error("Outline required. Complete outlining phase first.");
        }
        const jobId = `draft-${projectId}-${Date.now()}`;
        if (options?.allScenes) {
            // Queue all scenes
            for (const scene of outline.scenes) {
                await this.jobQueueService.enqueueJob({
                    jobId: `${jobId}-scene-${scene.scene_number}`,
                    projectId,
                    phase: "drafting",
                    inputData: {
                        scene,
                        moral_compass: project.moral_compass,
                    },
                });
            }
        }
        else {
            // Queue single scene
            const sceneNumber = options?.sceneNumber || 1;
            const scenes = outline.scenes;
            const scene = scenes.find((s) => s.scene_number === sceneNumber);
            if (!scene) {
                throw new Error(`Scene ${sceneNumber} not found in outline`);
            }
            await this.jobQueueService.enqueueJob({
                jobId,
                projectId,
                phase: "drafting",
                inputData: {
                    scene,
                    moral_compass: project.moral_compass,
                },
            });
        }
        await this.supabaseService.updateProjectStatus(projectId, "drafting");
        return {
            jobId,
            message: options?.allScenes
                ? `Draft generation started for all ${outline.scenes.length} scenes`
                : `Draft generation started for scene ${options?.sceneNumber || 1}`,
        };
    }
    async requestCritique(projectId, options) {
        const project = await this.supabaseService.getProject(projectId);
        if (!project) {
            throw new Error("Project not found");
        }
        const drafts = await this.supabaseService.getDrafts(projectId);
        if (drafts.length === 0) {
            throw new Error("No drafts found. Complete drafting phase first.");
        }
        const jobId = `critique-${projectId}-${Date.now()}`;
        if (options?.allScenes) {
            for (const draft of drafts) {
                await this.jobQueueService.enqueueJob({
                    jobId: `${jobId}-scene-${draft.scene_number}`,
                    projectId,
                    phase: "critique",
                    inputData: {
                        draft,
                        moral_compass: project.moral_compass,
                    },
                });
            }
        }
        else {
            const sceneNumber = options?.sceneNumber || 1;
            const draft = drafts.find((d) => d.scene_number === sceneNumber);
            if (!draft) {
                throw new Error(`Draft for scene ${sceneNumber} not found`);
            }
            await this.jobQueueService.enqueueJob({
                jobId,
                projectId,
                phase: "critique",
                inputData: {
                    draft,
                    moral_compass: project.moral_compass,
                },
            });
        }
        await this.supabaseService.updateProjectStatus(projectId, "critique");
        return {
            jobId,
            message: options?.allScenes
                ? `Critique requested for all ${drafts.length} drafts`
                : `Critique requested for scene ${options?.sceneNumber || 1}`,
        };
    }
    async getJobStatus(jobId) {
        const status = await this.jobQueueService.getJobStatus(jobId);
        return status;
    }
    async getQueueStats() {
        return await this.jobQueueService.getQueueStats();
    }
};
exports.GenerationController = GenerationController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", JobQueueService_1.JobQueueService)
], GenerationController.prototype, "jobQueueService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", SupabaseService_1.SupabaseService)
], GenerationController.prototype, "supabaseService", void 0);
__decorate([
    (0, common_1.Post)("/characters/:projectId"),
    (0, schema_1.Summary)("Generate character profiles"),
    (0, schema_1.Description)("Trigger character generation for a project"),
    (0, schema_1.Returns)(202),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GenerationController.prototype, "generateCharacters", null);
__decorate([
    (0, common_1.Post)("/outline/:projectId"),
    (0, schema_1.Summary)("Generate plot outline"),
    (0, schema_1.Description)("Trigger plot outline generation for a project"),
    (0, schema_1.Returns)(202),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GenerationController.prototype, "generateOutline", null);
__decorate([
    (0, common_1.Post)("/draft/:projectId"),
    (0, schema_1.Summary)("Generate narrative draft"),
    (0, schema_1.Description)("Trigger draft generation for a specific scene or all scenes"),
    (0, schema_1.Returns)(202),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GenerationController.prototype, "generateDraft", null);
__decorate([
    (0, common_1.Post)("/critique/:projectId"),
    (0, schema_1.Summary)("Request critique for drafts"),
    (0, schema_1.Description)("Trigger critique generation for scene drafts"),
    (0, schema_1.Returns)(202),
    __param(0, (0, common_1.PathParams)("projectId")),
    __param(1, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GenerationController.prototype, "requestCritique", null);
__decorate([
    (0, common_1.Get)("/status/:jobId"),
    (0, schema_1.Summary)("Get job status"),
    (0, schema_1.Description)("Check the status of a generation job"),
    __param(0, (0, common_1.PathParams)("jobId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GenerationController.prototype, "getJobStatus", null);
__decorate([
    (0, common_1.Get)("/queue/stats"),
    (0, schema_1.Summary)("Get queue statistics"),
    (0, schema_1.Description)("Get current job queue statistics"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GenerationController.prototype, "getQueueStats", null);
exports.GenerationController = GenerationController = __decorate([
    (0, common_1.Controller)("/generate"),
    (0, schema_1.Tags)("Generation"),
    (0, schema_1.Description)("Narrative generation endpoints")
], GenerationController);
//# sourceMappingURL=GenerationController.js.map