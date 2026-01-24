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
exports.ProjectController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const JobQueueService_1 = require("../services/JobQueueService");
const SupabaseService_1 = require("../services/SupabaseService");
const QdrantMemoryService_1 = require("../services/QdrantMemoryService");
const CacheService_1 = require("../services/CacheService");
const ProjectModels_1 = require("../models/ProjectModels");
let ProjectController = class ProjectController {
    jobQueueService;
    supabaseService;
    qdrantMemoryService;
    cacheService;
    async initProject(body) {
        // Create project in Supabase
        const project = await this.supabaseService.createProject({
            seed_idea: body.seedIdea,
            moral_compass: body.moralCompass,
            target_audience: body.targetAudience,
            theme_core: body.themeCore,
            status: "genesis",
        });
        // Enqueue Genesis job
        await this.jobQueueService.enqueueJob({
            jobId: `genesis-${project.id}`,
            projectId: project.id,
            phase: "genesis",
            inputData: {
                seed_idea: body.seedIdea,
                moral_compass: body.moralCompass,
                target_audience: body.targetAudience,
                theme_core: body.themeCore,
                tone_style_references: body.toneStyleReferences,
                custom_moral_system: body.customMoralSystem,
            },
        });
        return {
            id: project.id,
            status: "genesis",
            message: "Project initialized. Genesis phase started.",
            createdAt: project.created_at,
        };
    }
    async getProject(id) {
        // Use cache with getOrSet pattern for read operations
        const project = await this.cacheService.getOrSet("project", id, async () => {
            const dbProject = await this.supabaseService.getProject(id);
            if (!dbProject) {
                throw new Error("Project not found");
            }
            return dbProject;
        });
        return {
            id: project.id,
            status: project.status,
            seedIdea: project.seed_idea,
            moralCompass: project.moral_compass,
            targetAudience: project.target_audience,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
        };
    }
    async getNarrativePossibility(id) {
        // Use cache with getOrSet pattern for read operations
        return await this.cacheService.getOrSet("narrative", id, async () => await this.supabaseService.getNarrativePossibility(id));
    }
    async approvePhase(id, phase) {
        const project = await this.supabaseService.getProject(id);
        if (!project) {
            throw new Error("Project not found");
        }
        // Determine next phase
        const phaseOrder = ["genesis", "characters", "outlining", "drafting", "critique", "completed"];
        const currentIndex = phaseOrder.indexOf(project.status);
        const nextPhase = phaseOrder[currentIndex + 1];
        if (!nextPhase || nextPhase === "completed") {
            return {
                id: project.id,
                status: "completed",
                message: "Project completed!",
            };
        }
        // Update project status
        await this.supabaseService.updateProjectStatus(id, nextPhase);
        // Invalidate cache after status update
        await this.cacheService.invalidate("project", id);
        // Enqueue next phase job
        await this.jobQueueService.enqueueJob({
            jobId: `${nextPhase}-${id}`,
            projectId: id,
            phase: nextPhase,
            inputData: await this._getPhaseInputData(id, nextPhase),
        });
        return {
            id: project.id,
            status: nextPhase,
            message: `Phase approved. ${nextPhase} phase started.`,
        };
    }
    async listProjects(page = 1, limit = 10) {
        const { projects, total } = await this.supabaseService.listProjects(page, limit);
        return {
            projects: projects.map((p) => ({
                id: p.id,
                status: p.status,
                seedIdea: p.seed_idea,
                moralCompass: p.moral_compass,
                createdAt: p.created_at,
            })),
            total,
        };
    }
    async deleteProject(id) {
        // First, delete all Qdrant vectors for this project to prevent orphaned data
        // This must happen BEFORE Supabase deletion since we need the project to exist
        // for proper cascade deletion tracking
        // 
        // FAIL-FAST APPROACH: If Qdrant deletion fails, we abort the entire operation
        // to prevent orphaned data. This follows the "fail fast" principle - it's better
        // to fail and let the user retry than to succeed with partial deletion.
        try {
            await this.qdrantMemoryService.deleteProjectData(id);
            console.log(`[ProjectController] Deleted Qdrant vectors for project ${id}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[ProjectController] Failed to delete Qdrant vectors for project ${id}:`, error);
            throw new Error(`Cannot delete project: vector cleanup failed. Please try again. ${errorMessage}`);
        }
        // Delete from Supabase (cascades to related tables via foreign keys)
        await this.supabaseService.deleteProject(id);
        // Invalidate all caches for this project
        await this.cacheService.invalidateProject(id);
        return { success: true };
    }
    async _getPhaseInputData(projectId, phase) {
        const project = await this.supabaseService.getProject(projectId);
        switch (phase) {
            case "characters":
                const narrative = await this.supabaseService.getNarrativePossibility(projectId);
                return {
                    narrative_possibility: narrative,
                    moral_compass: project?.moral_compass,
                    target_audience: project?.target_audience,
                };
            case "outlining":
                const characters = await this.supabaseService.getCharacters(projectId);
                const narrativeForOutline = await this.supabaseService.getNarrativePossibility(projectId);
                return {
                    narrative_possibility: narrativeForOutline,
                    characters,
                    moral_compass: project?.moral_compass,
                };
            case "drafting":
                const outline = await this.supabaseService.getOutline(projectId);
                return {
                    outline,
                    moral_compass: project?.moral_compass,
                };
            case "critique":
                const drafts = await this.supabaseService.getDrafts(projectId);
                return {
                    drafts,
                    moral_compass: project?.moral_compass,
                };
            default:
                return {};
        }
    }
};
exports.ProjectController = ProjectController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", JobQueueService_1.JobQueueService)
], ProjectController.prototype, "jobQueueService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", SupabaseService_1.SupabaseService)
], ProjectController.prototype, "supabaseService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", QdrantMemoryService_1.QdrantMemoryService)
], ProjectController.prototype, "qdrantMemoryService", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", CacheService_1.CacheService)
], ProjectController.prototype, "cacheService", void 0);
__decorate([
    (0, common_1.Post)("/init"),
    (0, schema_1.Summary)("Initialize a new narrative project"),
    (0, schema_1.Description)("Creates a new project and triggers the Genesis phase with the Architect agent"),
    (0, schema_1.Returns)(201, ProjectModels_1.ProjectResponseDTO),
    __param(0, (0, common_1.BodyParams)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ProjectModels_1.StoryProjectDTO]),
    __metadata("design:returntype", Promise)
], ProjectController.prototype, "initProject", null);
__decorate([
    (0, common_1.Get)("/:id"),
    (0, schema_1.Summary)("Get project details"),
    (0, schema_1.Description)("Retrieve project status and details"),
    (0, schema_1.Returns)(200, ProjectModels_1.ProjectResponseDTO),
    __param(0, (0, common_1.PathParams)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectController.prototype, "getProject", null);
__decorate([
    (0, common_1.Get)("/:id/narrative"),
    (0, schema_1.Summary)("Get narrative possibility"),
    (0, schema_1.Description)("Retrieve the generated narrative possibility for a project"),
    (0, schema_1.Returns)(200, ProjectModels_1.NarrativePossibilityDTO),
    __param(0, (0, common_1.PathParams)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectController.prototype, "getNarrativePossibility", null);
__decorate([
    (0, common_1.Post)("/:id/approve"),
    (0, schema_1.Summary)("Approve current phase and proceed"),
    (0, schema_1.Description)("Approve the current phase output and trigger the next phase"),
    (0, schema_1.Returns)(200, ProjectModels_1.ProjectResponseDTO),
    __param(0, (0, common_1.PathParams)("id")),
    __param(1, (0, common_1.BodyParams)("phase")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ProjectController.prototype, "approvePhase", null);
__decorate([
    (0, common_1.Get)("/"),
    (0, schema_1.Summary)("List all projects"),
    (0, schema_1.Description)("Get a paginated list of all projects"),
    __param(0, (0, common_1.QueryParams)("page")),
    __param(1, (0, common_1.QueryParams)("limit")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], ProjectController.prototype, "listProjects", null);
__decorate([
    (0, common_1.Delete)("/:id"),
    (0, schema_1.Summary)("Delete a project"),
    (0, schema_1.Description)("Delete a project and all associated data including vector embeddings. Fails if vector deletion fails to maintain data consistency."),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(500),
    __param(0, (0, common_1.PathParams)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectController.prototype, "deleteProject", null);
exports.ProjectController = ProjectController = __decorate([
    (0, common_1.Controller)("/project"),
    (0, schema_1.Tags)("Project"),
    (0, schema_1.Description)("Project management endpoints")
], ProjectController);
//# sourceMappingURL=ProjectController.js.map