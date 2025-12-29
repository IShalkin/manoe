"use strict";
/**
 * Orchestration Controller
 *
 * Handles the complete narrative generation flow using the StorytellerOrchestrator.
 * Implements the async pattern: POST -> 202 Accepted -> GET Stream (SSE)
 *
 * Flow:
 * 1. Client -> POST /orchestrate/generate -> Controller
 * 2. Controller -> StorytellerOrchestrator -> Redis Stream (Push "Start")
 * 3. Client receives 202 Accepted + RunID
 * 4. Client -> GET /orchestrate/stream/:runId (SSE subscription)
 * 5. Orchestrator -> LLM API -> Redis Stream (Push chunks)
 * 6. Client <- SSE (Real-time text streaming)
 * 7. Background: Langfuse logs everything asynchronously
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
exports.OrchestrationController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const di_1 = require("@tsed/di");
const uuid_1 = require("uuid");
const StorytellerOrchestrator_1 = require("../services/StorytellerOrchestrator");
const RedisStreamsService_1 = require("../services/RedisStreamsService");
const LLMModels_1 = require("../models/LLMModels");
// ==================== DTOs ====================
/**
 * LLM Configuration DTO
 * Uses @Groups to separate public and internal fields
 */
class LLMConfigDTO {
    provider;
    model;
    apiKey;
    temperature;
}
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(LLMModels_1.LLMProvider),
    (0, schema_1.Description)("LLM provider to use"),
    (0, schema_1.Example)("openai"),
    __metadata("design:type", String)
], LLMConfigDTO.prototype, "provider", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Model name (e.g., gpt-4-turbo, claude-3-opus)"),
    (0, schema_1.Example)("gpt-4-turbo"),
    __metadata("design:type", String)
], LLMConfigDTO.prototype, "model", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Groups)("internal"),
    (0, schema_1.Description)("API key for the provider (BYOK - Bring Your Own Key)"),
    __metadata("design:type", String)
], LLMConfigDTO.prototype, "apiKey", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("Temperature for generation (0-2)"),
    (0, schema_1.Example)(0.7),
    __metadata("design:type", Number)
], LLMConfigDTO.prototype, "temperature", void 0);
/**
 * Generation Request DTO - supports both new TypeScript format and legacy Python format
 */
class GenerateRequestDTO {
    // New TypeScript format
    projectId;
    seedIdea;
    llmConfig;
    mode;
    settings;
    // Legacy Python format (snake_case)
    supabase_project_id;
    seed_idea;
    provider;
    model;
    api_key;
    generation_mode;
}
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("Project ID from Supabase"),
    (0, schema_1.Example)("550e8400-e29b-41d4-a716-446655440000"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "projectId", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("Seed idea for the narrative"),
    (0, schema_1.Example)("A story about a detective who can see ghosts"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "seedIdea", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("LLM configuration"),
    __metadata("design:type", LLMConfigDTO)
], GenerateRequestDTO.prototype, "llmConfig", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Enum)("full", "branching"),
    (0, schema_1.Description)("Generation mode: 'full' for complete story, 'branching' for interactive"),
    (0, schema_1.Example)("full"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "mode", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Groups)("internal"),
    (0, schema_1.Description)("Additional settings"),
    __metadata("design:type", Object)
], GenerateRequestDTO.prototype, "settings", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("Supabase project ID (legacy)"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "supabase_project_id", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("Seed idea (legacy)"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "seed_idea", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("LLM provider (legacy)"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "provider", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("LLM model (legacy)"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "model", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("API key (legacy)"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "api_key", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("Generation mode (legacy)"),
    __metadata("design:type", String)
], GenerateRequestDTO.prototype, "generation_mode", void 0);
/**
 * Generation Response DTO - includes both camelCase and snake_case for compatibility
 */
class GenerateResponseDTO {
    runId;
    run_id;
    success;
    message;
    streamUrl;
}
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Unique run identifier"),
    (0, schema_1.Example)("run-550e8400-e29b-41d4-a716-446655440000"),
    __metadata("design:type", String)
], GenerateResponseDTO.prototype, "runId", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Unique run identifier (legacy)"),
    (0, schema_1.Example)("run-550e8400-e29b-41d4-a716-446655440000"),
    __metadata("design:type", String)
], GenerateResponseDTO.prototype, "run_id", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Success status"),
    (0, schema_1.Example)(true),
    __metadata("design:type", Boolean)
], GenerateResponseDTO.prototype, "success", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Status message"),
    (0, schema_1.Example)("Generation started"),
    __metadata("design:type", String)
], GenerateResponseDTO.prototype, "message", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("SSE stream URL for real-time updates"),
    (0, schema_1.Example)("/orchestrate/stream/run-550e8400-e29b-41d4-a716-446655440000"),
    __metadata("design:type", String)
], GenerateResponseDTO.prototype, "streamUrl", void 0);
/**
 * Run Status DTO (public view)
 */
class RunStatusDTO {
    runId;
    projectId;
    phase;
    currentScene;
    totalScenes;
    isPaused;
    isCompleted;
    error;
    startedAt;
    updatedAt;
}
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Unique run identifier"),
    __metadata("design:type", String)
], RunStatusDTO.prototype, "runId", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Project ID"),
    __metadata("design:type", String)
], RunStatusDTO.prototype, "projectId", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(LLMModels_1.GenerationPhase),
    (0, schema_1.Description)("Current generation phase"),
    __metadata("design:type", String)
], RunStatusDTO.prototype, "phase", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Current scene number being processed"),
    __metadata("design:type", Number)
], RunStatusDTO.prototype, "currentScene", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Total number of scenes"),
    __metadata("design:type", Number)
], RunStatusDTO.prototype, "totalScenes", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Whether the run is paused"),
    __metadata("design:type", Boolean)
], RunStatusDTO.prototype, "isPaused", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Whether the run is completed"),
    __metadata("design:type", Boolean)
], RunStatusDTO.prototype, "isCompleted", void 0);
__decorate([
    (0, schema_1.Property)(),
    (0, schema_1.Description)("Error message if generation failed"),
    __metadata("design:type", String)
], RunStatusDTO.prototype, "error", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("When the run started"),
    __metadata("design:type", String)
], RunStatusDTO.prototype, "startedAt", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Last update timestamp"),
    __metadata("design:type", String)
], RunStatusDTO.prototype, "updatedAt", void 0);
/**
 * SSE Event structure documentation
 */
class SSEEventDTO {
    id;
    type;
    runId;
    timestamp;
    data;
}
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Event ID from Redis Stream"),
    (0, schema_1.Example)("1702834567890-0"),
    __metadata("design:type", String)
], SSEEventDTO.prototype, "id", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Event type: phase_start, phase_complete, agent_message, ERROR, heartbeat"),
    (0, schema_1.Example)("phase_start"),
    __metadata("design:type", String)
], SSEEventDTO.prototype, "type", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Run ID this event belongs to"),
    __metadata("design:type", String)
], SSEEventDTO.prototype, "runId", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("ISO timestamp"),
    __metadata("design:type", String)
], SSEEventDTO.prototype, "timestamp", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Description)("Event-specific data payload"),
    __metadata("design:type", Object)
], SSEEventDTO.prototype, "data", void 0);
// ==================== Controller ====================
let OrchestrationController = class OrchestrationController {
    orchestrator;
    redisStreams;
    /**
     * Start a new narrative generation
     */
    async startGeneration(request) {
        // Support both new TypeScript format and legacy Python format
        // Generate a proper UUID if no projectId is provided (Supabase expects UUID format)
        const projectId = request.projectId || request.supabase_project_id || (0, uuid_1.v4)();
        const seedIdea = request.seedIdea || request.seed_idea || "";
        const provider = request.llmConfig?.provider || request.provider;
        const model = request.llmConfig?.model || request.model || "";
        const apiKey = request.llmConfig?.apiKey || request.api_key || "";
        const mode = request.mode || request.generation_mode || "full";
        common_1.$log.info(`[OrchestrationController] startGeneration called, projectId: ${projectId}, seedIdea: ${seedIdea?.substring(0, 50)}...`);
        const options = {
            projectId,
            seedIdea,
            llmConfig: {
                provider,
                model,
                apiKey,
                temperature: request.llmConfig?.temperature,
            },
            mode,
            settings: request.settings,
        };
        try {
            common_1.$log.info(`[OrchestrationController] calling orchestrator.startGeneration, projectId: ${options.projectId}`);
            const runId = await this.orchestrator.startGeneration(options);
            common_1.$log.info(`[OrchestrationController] orchestrator.startGeneration returned runId: ${runId}`);
            return {
                runId,
                run_id: runId,
                success: true,
                message: "Generation started",
                streamUrl: `/stream/${runId}`,
            };
        }
        catch (error) {
            common_1.$log.error(`[OrchestrationController] startGeneration error:`, error);
            throw error;
        }
    }
    /**
     * SSE Stream endpoint for real-time events
     */
    async streamEvents(runId, req, res) {
        // Check if run exists
        const status = this.orchestrator.getRunStatus(runId);
        if (!status) {
            res.status(404).json({ error: "Run not found" });
            return;
        }
        // Set SSE headers - HTTP/2 compatible (no Connection header!)
        // Connection header is forbidden in HTTP/2 and causes ERR_HTTP2_PROTOCOL_ERROR
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering
        res.setHeader("Content-Encoding", "identity"); // Prevent compression which breaks SSE
        res.flushHeaders();
        // Send initial connection event (no event: header so onmessage receives it)
        res.write(`data: ${JSON.stringify({ type: "connected", runId, status: status.phase })}\n\n`);
        // Handle client disconnect - use res.on("close") instead of req.on("close")
        // req.on("close") can fire prematurely in some Express/TsED configurations
        let isConnected = true;
        res.on("close", () => {
            console.log(`[OrchestrationController] SSE connection closed for runId: ${runId}`);
            isConnected = false;
        });
        // Set up heartbeat to prevent idle timeout (Cloudflare/nginx may close idle connections)
        const heartbeatInterval = setInterval(() => {
            if (isConnected) {
                res.write(`: heartbeat\n\n`); // SSE comment, ignored by EventSource but keeps connection alive
            }
        }, 15000); // Every 15 seconds
        // First, send all existing events from the stream (catch up)
        // Track the last event ID to avoid race condition when switching to live streaming
        // Using "$" would miss events published between catch-up read and live streaming start
        let lastEventId = "0";
        try {
            const existingEvents = await this.redisStreams.getEvents(runId, "0", 1000);
            console.log(`[OrchestrationController] Sending ${existingEvents.length} existing events for runId: ${runId}`);
            const cinematicCount = existingEvents.filter(e => e.type === "agent_thought" || e.type === "agent_dialogue").length;
            console.log(`[OrchestrationController] Found ${cinematicCount} cinematic events in existing events`);
            let sentCount = 0;
            for (const event of existingEvents) {
                // Log cinematic events
                if (event.type === "agent_thought" || event.type === "agent_dialogue") {
                    console.log(`[OrchestrationController] Streaming existing cinematic event:`, event.type, `runId: ${runId}`, event.data);
                }
                // Send as generic message (no event: header) so onmessage receives it
                // The type is included in the data payload
                const sseData = JSON.stringify({
                    id: event.id,
                    type: event.type,
                    runId: event.runId,
                    timestamp: event.timestamp,
                    data: event.data,
                });
                res.write(`data: ${sseData}\n\n`);
                sentCount++;
                // Track the last event ID for seamless transition to live streaming
                if (event.id) {
                    lastEventId = event.id;
                }
            }
            console.log(`[OrchestrationController] Successfully sent ${sentCount} existing events for runId: ${runId}, lastEventId: ${lastEventId}`);
        }
        catch (error) {
            console.error(`[OrchestrationController] Error getting existing events:`, error, error instanceof Error ? error.stack : '');
        }
        // Then stream new events from Redis, starting AFTER the last event we sent
        // This prevents the "cursor gap" where events published between catch-up and live streaming are missed
        console.log(`[OrchestrationController] Starting live streaming from lastEventId: ${lastEventId} for runId: ${runId}`);
        const eventGenerator = this.redisStreams.streamEvents(runId, lastEventId, 15000);
        try {
            for await (const event of eventGenerator) {
                if (!isConnected)
                    break;
                // Log cinematic events
                if (event.type === "agent_thought" || event.type === "agent_dialogue") {
                    console.log(`[OrchestrationController] Streaming cinematic event:`, event.type, `runId: ${runId}`, event.data);
                }
                // Format as SSE (no event: header so onmessage receives it)
                const sseData = JSON.stringify({
                    id: event.id,
                    type: event.type,
                    runId: event.runId,
                    timestamp: event.timestamp,
                    data: event.data,
                });
                res.write(`data: ${sseData}\n\n`);
                // Stop streaming on terminal events
                if (event.type === "ERROR" || event.type === "generation_completed") {
                    break;
                }
            }
        }
        catch (error) {
            if (isConnected) {
                res.write(`data: ${JSON.stringify({ type: "ERROR", error: String(error) })}\n\n`);
            }
        }
        finally {
            clearInterval(heartbeatInterval);
            res.end();
        }
    }
    /**
     * SSE Stream endpoint (legacy route for Python orchestrator compatibility)
     */
    async streamEventsLegacy(runId, token, req, res) {
        // Delegate to the main streamEvents method
        return this.streamEvents(runId, req, res);
    }
    /**
     * Get run status
     */
    getStatus(runId) {
        const status = this.orchestrator.getRunStatus(runId);
        if (!status) {
            return { error: "Run not found" };
        }
        return status;
    }
    /**
     * Pause a running generation
     */
    pauseRun(runId) {
        const success = this.orchestrator.pauseRun(runId);
        return {
            success,
            message: success ? "Run paused" : "Run not found",
        };
    }
    /**
     * Resume a paused generation
     */
    resumeRun(runId) {
        const success = this.orchestrator.resumeRun(runId);
        return {
            success,
            message: success ? "Run resumed" : "Run not found",
        };
    }
    /**
     * Cancel a generation
     */
    cancelRun(runId) {
        const success = this.orchestrator.cancelRun(runId);
        return {
            success,
            message: success ? "Run cancelled" : "Run not found",
        };
    }
    /**
     * Pause a running generation (legacy route)
     */
    pauseRunLegacy(runId) {
        return this.pauseRun(runId);
    }
    /**
     * Resume a paused generation (legacy route)
     */
    resumeRunLegacy(runId) {
        return this.resumeRun(runId);
    }
    /**
     * List all active runs
     */
    listRuns() {
        return this.orchestrator.listActiveRuns();
    }
};
exports.OrchestrationController = OrchestrationController;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", StorytellerOrchestrator_1.StorytellerOrchestrator)
], OrchestrationController.prototype, "orchestrator", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", RedisStreamsService_1.RedisStreamsService)
], OrchestrationController.prototype, "redisStreams", void 0);
__decorate([
    (0, common_1.Post)("/generate"),
    (0, schema_1.Summary)("Start narrative generation"),
    (0, schema_1.Description)(`
Initiates a new narrative generation run. Returns immediately with a run ID.

**Important:** This is an async operation. Use the returned streamUrl to subscribe to real-time events.

**SSE Event Types:**
- \`generation_started\` - Generation has begun
- \`phase_start\` - New phase started (genesis, characters, etc.)
- \`phase_complete\` - Phase completed with artifacts
- \`agent_message\` - Agent produced output
- \`scene_draft_start\` - Scene drafting started
- \`scene_draft_complete\` - Scene draft ready
- \`ERROR\` - Terminal error (stop listening)
- \`generation_completed\` - All done
- \`heartbeat\` - Keep-alive (every 15s)
  `),
    (0, schema_1.Returns)(202, GenerateResponseDTO),
    (0, schema_1.Returns)(400),
    (0, schema_1.Returns)(500),
    __param(0, (0, common_1.BodyParams)()),
    __param(0, (0, schema_1.Groups)("!internal")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [GenerateRequestDTO]),
    __metadata("design:returntype", Promise)
], OrchestrationController.prototype, "startGeneration", null);
__decorate([
    (0, common_1.Get)("/stream/:runId"),
    (0, common_1.AcceptMime)("text/event-stream", "application/json", "*/*"),
    (0, schema_1.Summary)("Subscribe to generation events (SSE)"),
    (0, schema_1.Description)(`
Server-Sent Events (SSE) endpoint for real-time generation updates.

**Connection Headers:**
\`\`\`
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no (for Nginx)
\`\`\`

**Event Format:**
\`\`\`
event: phase_start
data: {"phase": "genesis", "timestamp": "..."}

event: ERROR
data: {"error": "...", "phase": "drafting", "recoverable": false}
\`\`\`

**Important:**
- Heartbeat events sent every 15 seconds to prevent proxy timeouts
- Check for \`ERROR\` event type to detect failures
- \`generation_completed\` signals successful completion
  `),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], OrchestrationController.prototype, "streamEvents", null);
__decorate([
    (0, common_1.Get)("/runs/:runId/events"),
    (0, common_1.AcceptMime)("text/event-stream", "application/json", "*/*"),
    (0, schema_1.Summary)("Subscribe to generation events (SSE) - legacy route"),
    (0, schema_1.Description)("Legacy route for Python orchestrator compatibility."),
    (0, schema_1.Returns)(200, SSEEventDTO),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __param(1, (0, common_1.QueryParams)("token")),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], OrchestrationController.prototype, "streamEventsLegacy", null);
__decorate([
    (0, common_1.Get)("/status/:runId"),
    (0, schema_1.Summary)("Get generation run status"),
    (0, schema_1.Description)("Returns the current status of a generation run including phase, progress, and any errors."),
    (0, schema_1.Returns)(200, RunStatusDTO),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], OrchestrationController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)("/pause/:runId"),
    (0, schema_1.Summary)("Pause generation"),
    (0, schema_1.Description)("Pauses an active generation run. Can be resumed later."),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], OrchestrationController.prototype, "pauseRun", null);
__decorate([
    (0, common_1.Post)("/resume/:runId"),
    (0, schema_1.Summary)("Resume generation"),
    (0, schema_1.Description)("Resumes a paused generation run."),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], OrchestrationController.prototype, "resumeRun", null);
__decorate([
    (0, common_1.Post)("/cancel/:runId"),
    (0, schema_1.Summary)("Cancel generation"),
    (0, schema_1.Description)("Cancels an active generation run. This action cannot be undone."),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], OrchestrationController.prototype, "cancelRun", null);
__decorate([
    (0, common_1.Post)("/runs/:runId/pause"),
    (0, schema_1.Summary)("Pause generation (legacy)"),
    (0, schema_1.Description)("Legacy route for Python orchestrator compatibility."),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], OrchestrationController.prototype, "pauseRunLegacy", null);
__decorate([
    (0, common_1.Post)("/runs/:runId/resume"),
    (0, schema_1.Summary)("Resume generation (legacy)"),
    (0, schema_1.Description)("Legacy route for Python orchestrator compatibility."),
    (0, schema_1.Returns)(200),
    (0, schema_1.Returns)(404),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], OrchestrationController.prototype, "resumeRunLegacy", null);
__decorate([
    (0, common_1.Get)("/runs"),
    (0, schema_1.Summary)("List active generation runs"),
    (0, schema_1.Description)("Returns a list of all currently active generation runs."),
    (0, schema_1.Returns)(200, Array),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Array)
], OrchestrationController.prototype, "listRuns", null);
exports.OrchestrationController = OrchestrationController = __decorate([
    (0, common_1.Controller)("/"),
    (0, schema_1.Tags)("Orchestration"),
    (0, schema_1.Description)(`
Narrative generation orchestration endpoints.

**Architecture:**
- Pure TypeScript orchestrator (no Python dependency)
- 9 specialized AI agents (Architect, Profiler, Worldbuilder, Strategist, Writer, Critic, Originality, Impact, Archivist)
- Phase-based generation: Genesis → Characters → Worldbuilding → Outlining → Drafting → Polish
- Real-time SSE streaming via Redis Streams
- Langfuse observability with Prompt Management

**Flow:**
1. POST /orchestrate/generate - Start generation (returns 202 + runId)
2. GET /orchestrate/stream/:runId - Subscribe to SSE events
3. GET /orchestrate/status/:runId - Check run status
4. POST /orchestrate/pause/:runId - Pause generation
5. POST /orchestrate/resume/:runId - Resume generation
6. POST /orchestrate/cancel/:runId - Cancel generation
`)
], OrchestrationController);
//# sourceMappingURL=OrchestrationController.js.map