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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobQueueService = void 0;
const di_1 = require("@tsed/di");
const ioredis_1 = __importDefault(require("ioredis"));
let JobQueueService = class JobQueueService {
    client = null;
    // Queue names
    QUEUE_PENDING = "manoe:jobs:pending";
    QUEUE_PROCESSING = "manoe:jobs:processing";
    QUEUE_COMPLETED = "manoe:jobs:completed";
    QUEUE_FAILED = "manoe:jobs:failed";
    // Pub/Sub channels
    CHANNEL_PROJECT = "manoe:events:project";
    CHANNEL_GENERATION = "manoe:events:generation";
    constructor() {
        this.connect();
    }
    connect() {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.client = new ioredis_1.default(redisUrl);
        this.client.on("error", (err) => {
            console.error("Redis connection error:", err);
        });
        this.client.on("connect", () => {
            console.log("Connected to Redis");
        });
    }
    getClient() {
        if (!this.client) {
            throw new Error("Redis client not initialized");
        }
        return this.client;
    }
    async ping() {
        return await this.getClient().ping();
    }
    async enqueueJob(job) {
        const client = this.getClient();
        const jobData = {
            ...job,
            createdAt: new Date().toISOString(),
            retryCount: job.retryCount || 0,
            maxRetries: job.maxRetries || 3,
        };
        await client.lpush(this.QUEUE_PENDING, JSON.stringify(jobData));
        // Publish event
        await this.publishEvent(this.CHANNEL_PROJECT, {
            type: "job_enqueued",
            jobId: job.jobId,
            projectId: job.projectId,
            phase: job.phase,
            timestamp: new Date().toISOString(),
        });
        return job.jobId;
    }
    async getJobStatus(jobId) {
        const client = this.getClient();
        // Check if completed
        const resultKey = `manoe:results:${jobId}`;
        const result = await client.get(resultKey);
        if (result) {
            return {
                status: "completed",
                result: JSON.parse(result),
            };
        }
        // Check if in processing
        const processing = await client.lrange(this.QUEUE_PROCESSING, 0, -1);
        for (const item of processing) {
            const job = JSON.parse(item);
            if (job.jobId === jobId) {
                return { status: "processing" };
            }
        }
        // Check if pending
        const pending = await client.lrange(this.QUEUE_PENDING, 0, -1);
        for (const item of pending) {
            const job = JSON.parse(item);
            if (job.jobId === jobId) {
                return { status: "pending" };
            }
        }
        // Check if failed
        const failed = await client.lrange(this.QUEUE_FAILED, 0, -1);
        for (const item of failed) {
            const failure = JSON.parse(item);
            if (failure.jobId === jobId) {
                return {
                    status: "failed",
                    result: { error: failure.error },
                };
            }
        }
        return { status: "not_found" };
    }
    async getQueueStats() {
        const client = this.getClient();
        return {
            pending: await client.llen(this.QUEUE_PENDING),
            processing: await client.llen(this.QUEUE_PROCESSING),
            completed: await client.llen(this.QUEUE_COMPLETED),
            failed: await client.llen(this.QUEUE_FAILED),
        };
    }
    async publishEvent(channel, event) {
        const client = this.getClient();
        await client.publish(channel, JSON.stringify(event));
    }
    async subscribe(channels, callback) {
        const subscriber = this.getClient().duplicate();
        await subscriber.subscribe(...channels);
        subscriber.on("message", (channel, message) => {
            callback(channel, JSON.parse(message));
        });
    }
    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.client = null;
        }
    }
};
exports.JobQueueService = JobQueueService;
exports.JobQueueService = JobQueueService = __decorate([
    (0, di_1.Service)(),
    __metadata("design:paramtypes", [])
], JobQueueService);
//# sourceMappingURL=JobQueueService.js.map