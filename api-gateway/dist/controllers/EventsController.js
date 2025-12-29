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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsController = void 0;
const common_1 = require("@tsed/common");
const schema_1 = require("@tsed/schema");
const ioredis_1 = __importDefault(require("ioredis"));
let EventsController = class EventsController {
    redisClient = null;
    constructor() {
        this.connect();
    }
    connect() {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.redisClient = new ioredis_1.default(redisUrl);
        this.redisClient.on("error", (err) => {
            console.error("Redis connection error (Events):", err);
        });
    }
    getClient() {
        if (!this.redisClient) {
            throw new Error("Redis client not initialized");
        }
        return this.redisClient;
    }
    async streamEvents(runId, req, res) {
        // Set SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
        res.flushHeaders();
        const client = this.getClient();
        const streamKey = `manoe:events:${runId}`;
        let lastId = "$"; // Start from new events only
        let isConnected = true;
        // Send initial connection event
        this.sendEvent(res, {
            id: "connected",
            type: "connected",
            runId,
            timestamp: new Date().toISOString(),
            data: { message: "Connected to event stream" },
        });
        // Handle client disconnect
        req.on("close", () => {
            isConnected = false;
            console.log(`SSE client disconnected for run: ${runId}`);
        });
        // Poll for new events
        const pollInterval = 1000; // 1 second
        const heartbeatInterval = 15000; // 15 seconds
        let lastHeartbeat = Date.now();
        while (isConnected) {
            try {
                // Read new events from stream
                const entries = await client.xread("BLOCK", pollInterval.toString(), "STREAMS", streamKey, lastId);
                if (entries && entries.length > 0) {
                    for (const [, streamEntries] of entries) {
                        for (const [entryId, fields] of streamEntries) {
                            lastId = entryId;
                            // Parse fields array into object
                            const fieldObj = {};
                            for (let i = 0; i < fields.length; i += 2) {
                                fieldObj[fields[i]] = fields[i + 1];
                            }
                            const event = {
                                id: entryId,
                                type: fieldObj.type || "unknown",
                                runId: fieldObj.run_id || runId,
                                timestamp: fieldObj.timestamp || new Date().toISOString(),
                                data: fieldObj.data ? JSON.parse(fieldObj.data) : {},
                            };
                            this.sendEvent(res, event);
                            // Check for completion events
                            if (event.type === "generation_complete" ||
                                event.type === "generation_error" ||
                                event.type === "phase_complete" && event.data.phase === "drafting") {
                                // Send final event and close
                                this.sendEvent(res, {
                                    id: "stream_end",
                                    type: "stream_end",
                                    runId,
                                    timestamp: new Date().toISOString(),
                                    data: { message: "Generation complete" },
                                });
                                isConnected = false;
                                break;
                            }
                        }
                    }
                }
                // Send heartbeat if needed
                if (Date.now() - lastHeartbeat > heartbeatInterval) {
                    this.sendEvent(res, {
                        id: "heartbeat",
                        type: "heartbeat",
                        runId,
                        timestamp: new Date().toISOString(),
                        data: {},
                    });
                    lastHeartbeat = Date.now();
                }
            }
            catch (error) {
                console.error(`Error reading stream for run ${runId}:`, error);
                // Send error event
                this.sendEvent(res, {
                    id: "error",
                    type: "error",
                    runId,
                    timestamp: new Date().toISOString(),
                    data: { error: String(error) },
                });
                // Wait before retrying
                await this.sleep(1000);
            }
        }
        res.end();
    }
    async getEventHistory(runId) {
        const client = this.getClient();
        const streamKey = `manoe:events:${runId}`;
        try {
            const entries = await client.xrange(streamKey, "-", "+", "COUNT", "1000");
            const events = entries.map(([entryId, fields]) => {
                // Parse fields array into object
                const fieldObj = {};
                for (let i = 0; i < fields.length; i += 2) {
                    fieldObj[fields[i]] = fields[i + 1];
                }
                return {
                    id: entryId,
                    type: fieldObj.type || "unknown",
                    runId: fieldObj.run_id || runId,
                    timestamp: fieldObj.timestamp || "",
                    data: fieldObj.data ? JSON.parse(fieldObj.data) : {},
                };
            });
            return { events };
        }
        catch (error) {
            console.error(`Error getting history for run ${runId}:`, error);
            return { events: [] };
        }
    }
    async healthCheck() {
        try {
            const client = this.getClient();
            await client.ping();
            return { status: "healthy", redis: "connected" };
        }
        catch (error) {
            return { status: "unhealthy", redis: "disconnected" };
        }
    }
    sendEvent(res, event) {
        res.write(`id: ${event.id}\n`);
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.EventsController = EventsController;
__decorate([
    (0, common_1.Get)("/runs/:runId"),
    (0, schema_1.Summary)("Stream events for a generation run"),
    (0, schema_1.Description)("Server-Sent Events endpoint for real-time generation progress"),
    __param(0, (0, common_1.PathParams)("runId")),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], EventsController.prototype, "streamEvents", null);
__decorate([
    (0, common_1.Get)("/runs/:runId/history"),
    (0, schema_1.Summary)("Get event history for a run"),
    (0, schema_1.Description)("Retrieve all past events for a generation run"),
    (0, schema_1.Returns)(200),
    __param(0, (0, common_1.PathParams)("runId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EventsController.prototype, "getEventHistory", null);
__decorate([
    (0, common_1.Get)("/health"),
    (0, schema_1.Summary)("Check events service health"),
    (0, schema_1.Returns)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EventsController.prototype, "healthCheck", null);
exports.EventsController = EventsController = __decorate([
    (0, common_1.Controller)("/events"),
    (0, schema_1.Tags)("Events"),
    (0, schema_1.Description)("Server-Sent Events for real-time updates"),
    __metadata("design:paramtypes", [])
], EventsController);
//# sourceMappingURL=EventsController.js.map