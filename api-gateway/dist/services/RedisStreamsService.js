"use strict";
/**
 * Redis Streams Service for MANOE
 * Provides reliable event streaming using Redis Streams for real-time updates
 *
 * Features:
 * - Reliable event delivery with consumer groups
 * - Real-time event streaming to SSE endpoints
 * - Event persistence and replay capability
 * - Heartbeat support for connection keep-alive
 *
 * IMPORTANT: Uses separate Redis connections for reading and writing to avoid
 * head-of-line blocking. XREAD BLOCK commands on a shared connection would
 * block all other commands (including XADD publishes) until the block times out.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisStreamsService = void 0;
const di_1 = require("@tsed/di");
const ioredis_1 = __importDefault(require("ioredis"));
const MetricsService_1 = require("./MetricsService");
let RedisStreamsService = class RedisStreamsService {
    // Dedicated writer client - never blocked by XREAD
    writerClient = null;
    // Redis URL for creating reader connections
    redisUrl = "";
    // Track last processed event ID per stream for approximate lag calculation
    // Since we use XREAD instead of Consumer Groups, we track position manually
    lastProcessedIds = new Map();
    metricsService;
    // Legacy alias for backward compatibility
    get client() {
        return this.writerClient;
    }
    // Stream name templates
    STREAM_EVENTS = "manoe:events:{runId}";
    STREAM_GLOBAL = "manoe:events:global";
    // Consumer group
    CONSUMER_GROUP = "manoe-consumers";
    constructor() {
        this.connect();
    }
    /**
     * Establish connection to Redis (writer client only)
     * Reader connections are created per-stream to avoid head-of-line blocking
     */
    connect() {
        this.redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.writerClient = new ioredis_1.default(this.redisUrl);
        this.writerClient.on("error", (err) => {
            console.error("Redis Streams writer connection error:", err);
        });
        this.writerClient.on("connect", () => {
            console.log("Redis Streams writer connected");
        });
    }
    /**
     * Get the writer Redis client (for XADD, XRANGE, etc.)
     * This client is never blocked by XREAD operations
     */
    getClient() {
        if (!this.writerClient) {
            throw new Error("Redis writer client not initialized");
        }
        return this.writerClient;
    }
    /**
     * Create a dedicated reader connection for streaming
     * Each SSE connection gets its own reader to avoid blocking other operations
     */
    createReaderConnection() {
        const reader = new ioredis_1.default(this.redisUrl);
        reader.on("error", (err) => {
            console.error("Redis Streams reader connection error:", err);
        });
        return reader;
    }
    /**
     * Get the stream key for a specific run
     */
    getStreamKey(runId) {
        return this.STREAM_EVENTS.replace("{runId}", runId);
    }
    /**
     * Publish an event to a run-specific stream
     *
     * @param runId - Unique identifier for the generation run
     * @param eventType - Type of event (e.g., "phase_start", "agent_complete")
     * @param data - Event data payload
     * @param maxlen - Maximum stream length (older events are trimmed)
     * @returns The stream entry ID
     */
    async publishEvent(runId, eventType, data, maxlen = 1000) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        // Generate unique eventId for deduplication on frontend
        // Format: timestamp-random to ensure uniqueness even for events in same millisecond
        const eventId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const event = {
            type: eventType,
            runId: runId,
            eventId: eventId,
            timestamp: new Date().toISOString(),
            data: JSON.stringify(data),
        };
        // Add to run-specific stream with MAXLEN for automatic trimming
        const entryId = await client.xadd(streamKey, "MAXLEN", "~", maxlen.toString(), "*", ...Object.entries(event).flat());
        // Also add to global stream for monitoring
        await client.xadd(this.STREAM_GLOBAL, "MAXLEN", "~", (maxlen * 10).toString(), "*", ...Object.entries(event).flat());
        // Record Redis stream metrics after publishing
        try {
            const streamInfo = await this.getStreamInfo(runId);
            this.metricsService.recordRedisStreamMetrics({
                streamKey,
                length: streamInfo.length,
            });
        }
        catch (metricsError) {
            // Don't fail the publish if metrics recording fails
            console.warn("[RedisStreamsService] Failed to record stream metrics:", metricsError);
        }
        return entryId ?? "";
    }
    /**
     * Get events from a run-specific stream
     *
     * @param runId - Unique identifier for the generation run
     * @param startId - Start reading from this ID (exclusive)
     * @param count - Maximum number of events to return
     * @returns List of events with their IDs
     */
    async getEvents(runId, startId = "0", count = 100) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        try {
            const entries = await client.xrange(streamKey, startId === "0" ? "-" : `(${startId}`, "+", "COUNT", count.toString());
            return entries.map(([id, fields]) => this.parseStreamEntry(id, fields));
        }
        catch (error) {
            console.error("Error getting events:", error);
            return [];
        }
    }
    /**
     * Stream events from a run-specific stream (async generator)
     *
     * IMPORTANT: Creates a dedicated Redis connection for this stream to avoid
     * head-of-line blocking. The XREAD BLOCK command would otherwise block all
     * other Redis operations on a shared connection (including XADD publishes).
     *
     * @param runId - Unique identifier for the generation run
     * @param startId - Start reading from this ID ("$" for new events only)
     * @param blockMs - Block timeout in milliseconds
     */
    async *streamEvents(runId, startId = "$", blockMs = 5000) {
        // Create a dedicated reader connection for this stream
        // This prevents XREAD BLOCK from blocking XADD operations on the writer
        const readerClient = this.createReaderConnection();
        const streamKey = this.getStreamKey(runId);
        let lastId = startId;
        try {
            while (true) {
                try {
                    const entries = await readerClient.call("XREAD", "BLOCK", blockMs.toString(), "COUNT", "10", "STREAMS", streamKey, lastId);
                    if (entries && entries.length > 0) {
                        for (const [, streamEntries] of entries) {
                            for (const [entryId, fields] of streamEntries) {
                                lastId = entryId;
                                // Track last processed ID for approximate lag calculation
                                this.lastProcessedIds.set(streamKey, entryId);
                                yield this.parseStreamEntry(entryId, fields);
                            }
                        }
                    }
                    else {
                        // No new events, yield heartbeat
                        yield {
                            id: "heartbeat",
                            type: "heartbeat",
                            runId: runId,
                            eventId: `heartbeat-${Date.now()}`, // Unique eventId for heartbeat
                            timestamp: new Date().toISOString(),
                            data: {},
                        };
                    }
                }
                catch (error) {
                    if (error.message?.includes("NOGROUP")) {
                        break;
                    }
                    // Log error and yield error event
                    yield {
                        id: "error",
                        type: "error",
                        runId: runId,
                        eventId: `error-${Date.now()}`, // Unique eventId for error
                        timestamp: new Date().toISOString(),
                        data: { error: String(error) },
                    };
                    await this.sleep(1000);
                }
            }
        }
        finally {
            // Clean up the dedicated reader connection when the generator ends
            // This happens when the SSE connection closes or the generator is stopped
            try {
                await readerClient.quit();
            }
            catch (e) {
                // Ignore cleanup errors
            }
        }
    }
    /**
     * Create a consumer group for a stream
     *
     * @param runId - Unique identifier for the generation run
     * @param groupName - Consumer group name (defaults to CONSUMER_GROUP)
     * @returns True if created, False if already exists
     */
    async createConsumerGroup(runId, groupName) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        const group = groupName ?? this.CONSUMER_GROUP;
        try {
            await client.xgroup("CREATE", streamKey, group, "0", "MKSTREAM");
            return true;
        }
        catch (error) {
            if (error.message?.includes("BUSYGROUP")) {
                return false;
            }
            throw error;
        }
    }
    /**
     * Get information about a stream
     *
     * @param runId - Unique identifier for the generation run
     * @returns Stream information including length, groups, etc.
     */
    async getStreamInfo(runId) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        try {
            const info = await client.xinfo("STREAM", streamKey);
            const infoObj = this.parseXInfoResponse(info);
            return {
                length: typeof infoObj.length === "number" ? infoObj.length : 0,
                firstEntry: infoObj["first-entry"],
                lastEntry: infoObj["last-entry"],
                groups: typeof infoObj.groups === "number" ? infoObj.groups : 0,
                exists: true,
            };
        }
        catch (error) {
            return { length: 0, exists: false };
        }
    }
    /**
     * Delete a stream and all its data
     *
     * @param runId - Unique identifier for the generation run
     * @returns True if deleted
     */
    async deleteStream(runId) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        const result = await client.del(streamKey);
        return result > 0;
    }
    /**
     * Trim a stream to a maximum length
     *
     * @param runId - Unique identifier for the generation run
     * @param maxlen - Maximum number of entries to keep
     * @returns Number of entries removed
     */
    async trimStream(runId, maxlen = 1000) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        return await client.xtrim(streamKey, "MAXLEN", "~", maxlen);
    }
    /**
     * Check if a run exists (has events)
     */
    async runExists(runId) {
        const info = await this.getStreamInfo(runId);
        return info.exists && info.length > 0;
    }
    /**
     * Get the last event for a run
     */
    async getLastEvent(runId) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        try {
            const entries = await client.xrevrange(streamKey, "+", "-", "COUNT", "1");
            if (entries.length > 0) {
                const [id, fields] = entries[0];
                return this.parseStreamEntry(id, fields);
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Parse a stream entry into a StreamEvent
     */
    parseStreamEntry(id, fields) {
        const fieldMap = {};
        for (let i = 0; i < fields.length; i += 2) {
            fieldMap[fields[i]] = fields[i + 1];
        }
        return {
            id,
            type: fieldMap.type ?? "unknown",
            runId: fieldMap.runId ?? "",
            eventId: fieldMap.eventId ?? id, // Fall back to stream entry ID if eventId not present
            timestamp: fieldMap.timestamp ?? new Date().toISOString(),
            data: fieldMap.data ? JSON.parse(fieldMap.data) : {},
        };
    }
    /**
     * Parse XINFO response into an object
     */
    parseXInfoResponse(info) {
        const result = {};
        for (let i = 0; i < info.length; i += 2) {
            result[String(info[i])] = info[i + 1];
        }
        return result;
    }
    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    // ==================== LAG MONITORING ====================
    /**
     * Get consumer group information for a stream
     * Used for monitoring consumer lag
     *
     * @param runId - Unique identifier for the generation run
     * @returns Array of consumer group information
     */
    async getConsumerGroups(runId) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        try {
            const groups = await client.xinfo("GROUPS", streamKey);
            return groups.map((group) => {
                const groupObj = this.parseXInfoResponse(group);
                return {
                    name: String(groupObj.name || ""),
                    consumers: typeof groupObj.consumers === "number" ? groupObj.consumers : 0,
                    pending: typeof groupObj.pending === "number" ? groupObj.pending : 0,
                    lastDeliveredId: String(groupObj["last-delivered-id"] || "0-0"),
                    lag: typeof groupObj.lag === "number" ? groupObj.lag : undefined,
                };
            });
        }
        catch (error) {
            // Stream doesn't exist or has no groups
            return [];
        }
    }
    /**
     * Get comprehensive lag metrics for a stream
     * Used for Prometheus metrics and alerting
     *
     * @param runId - Unique identifier for the generation run
     * @returns Stream lag metrics including total lag across all groups
     */
    async getStreamLagMetrics(runId) {
        const streamKey = this.getStreamKey(runId);
        const streamInfo = await this.getStreamInfo(runId);
        const groups = await this.getConsumerGroups(runId);
        // Calculate total lag across all consumer groups
        let totalLag = 0;
        for (const group of groups) {
            if (group.lag !== undefined) {
                totalLag += group.lag;
            }
            else {
                // Estimate lag from pending count if lag not available
                totalLag += group.pending;
            }
        }
        // If no consumer groups exist (using XREAD instead of XREADGROUP),
        // calculate approximate lag from tracked position
        if (groups.length === 0 && streamInfo.length > 0) {
            const lastProcessedId = this.lastProcessedIds.get(streamKey);
            if (lastProcessedId) {
                // Approximate lag by counting events after last processed ID
                totalLag = await this.countEventsAfter(runId, lastProcessedId);
            }
            else {
                // No events processed yet, lag equals stream length
                totalLag = streamInfo.length;
            }
        }
        return {
            streamKey,
            length: streamInfo.length,
            groups,
            totalLag,
        };
    }
    /**
     * Count events in stream after a given ID
     * Used for approximate lag calculation when not using Consumer Groups
     *
     * @param runId - Unique identifier for the generation run
     * @param afterId - Count events after this ID
     * @returns Number of events after the given ID
     */
    async countEventsAfter(runId, afterId) {
        const client = this.getClient();
        const streamKey = this.getStreamKey(runId);
        // Cap at 5000 to prevent memory issues if consumer is far behind
        // This gives approximate lag which is sufficient for metrics
        const MAX_LAG_COUNT = 5000;
        try {
            // Use XRANGE with COUNT limit to avoid loading too many entries into memory
            const entries = await client.xrange(streamKey, `(${afterId}`, "+", "COUNT", MAX_LAG_COUNT.toString());
            // If we hit the limit, return the limit as approximate lag
            // (actual lag may be higher but this is sufficient for alerting)
            return entries.length;
        }
        catch (error) {
            console.error("[RedisStreamsService] Error counting events after ID:", error);
            return 0;
        }
    }
    /**
     * Get lag metrics for the global events stream
     * Used for overall system health monitoring
     *
     * @returns Stream lag metrics for the global stream
     */
    async getGlobalStreamLagMetrics() {
        const client = this.getClient();
        const streamKey = this.STREAM_GLOBAL;
        try {
            const info = await client.xinfo("STREAM", streamKey);
            const infoObj = this.parseXInfoResponse(info);
            let groups = [];
            try {
                const groupsRaw = await client.xinfo("GROUPS", streamKey);
                groups = groupsRaw.map((group) => {
                    const groupObj = this.parseXInfoResponse(group);
                    return {
                        name: String(groupObj.name || ""),
                        consumers: typeof groupObj.consumers === "number" ? groupObj.consumers : 0,
                        pending: typeof groupObj.pending === "number" ? groupObj.pending : 0,
                        lastDeliveredId: String(groupObj["last-delivered-id"] || "0-0"),
                        lag: typeof groupObj.lag === "number" ? groupObj.lag : undefined,
                    };
                });
            }
            catch {
                // No groups exist
            }
            let totalLag = 0;
            for (const group of groups) {
                totalLag += group.lag ?? group.pending;
            }
            return {
                streamKey,
                length: typeof infoObj.length === "number" ? infoObj.length : 0,
                groups,
                totalLag,
            };
        }
        catch (error) {
            return {
                streamKey,
                length: 0,
                groups: [],
                totalLag: 0,
            };
        }
    }
    /**
     * Get all active stream keys for monitoring
     * Scans for all manoe:events:* streams
     *
     * @returns Array of stream keys
     */
    async getActiveStreamKeys() {
        const client = this.getClient();
        const pattern = "manoe:events:*";
        const keys = [];
        let cursor = "0";
        do {
            const [nextCursor, foundKeys] = await client.scan(cursor, "MATCH", pattern, "COUNT", "100");
            cursor = nextCursor;
            keys.push(...foundKeys);
        } while (cursor !== "0");
        return keys;
    }
    /**
     * Get lag metrics for all active streams
     * Used for comprehensive monitoring dashboard
     *
     * @returns Map of stream key to lag metrics
     */
    async getAllStreamLagMetrics() {
        const metrics = new Map();
        const keys = await this.getActiveStreamKeys();
        for (const key of keys) {
            // Extract runId from key (manoe:events:{runId})
            const runId = key.replace("manoe:events:", "");
            if (runId && runId !== "global") {
                const lagMetrics = await this.getStreamLagMetrics(runId);
                metrics.set(key, lagMetrics);
            }
        }
        // Add global stream metrics
        const globalMetrics = await this.getGlobalStreamLagMetrics();
        metrics.set(this.STREAM_GLOBAL, globalMetrics);
        return metrics;
    }
    /**
     * Check if any stream has lag above threshold
     * Used for alerting
     *
     * @param threshold - Maximum acceptable lag (default: 1000)
     * @returns Array of streams exceeding the threshold
     */
    async checkLagThreshold(threshold = 1000) {
        const allMetrics = await this.getAllStreamLagMetrics();
        const exceeding = [];
        for (const [streamKey, metrics] of allMetrics) {
            if (metrics.totalLag > threshold) {
                exceeding.push({ streamKey, lag: metrics.totalLag });
            }
        }
        return exceeding;
    }
    /**
     * Collect and record consumer lag metrics for all active streams
     * This method should be called periodically (e.g., every 30 seconds) to update Prometheus metrics
     *
     * @returns Number of streams processed
     */
    async collectAndRecordLagMetrics() {
        try {
            const allMetrics = await this.getAllStreamLagMetrics();
            let processed = 0;
            for (const [streamKey, metrics] of allMetrics) {
                // Record stream length
                this.metricsService.recordRedisStreamMetrics({
                    streamKey,
                    length: metrics.length,
                });
                // Record consumer lag for each consumer group
                if (metrics.groups.length > 0) {
                    for (const group of metrics.groups) {
                        const lag = group.lag ?? group.pending;
                        this.metricsService.recordRedisStreamMetrics({
                            streamKey,
                            length: metrics.length,
                            consumerLag: lag,
                        });
                    }
                }
                else {
                    // No consumer groups - record approximate lag from totalLag
                    // (calculated in getStreamLagMetrics using tracked position)
                    this.metricsService.recordRedisStreamMetrics({
                        streamKey,
                        length: metrics.length,
                        consumerLag: metrics.totalLag,
                    });
                }
                processed++;
            }
            return processed;
        }
        catch (error) {
            console.error("[RedisStreamsService] Failed to collect lag metrics:", error);
            return 0;
        }
    }
    /**
     * Start periodic lag metrics collection
     * Collects and records lag metrics every intervalMs milliseconds
     *
     * @param intervalMs - Collection interval in milliseconds (default: 30000 = 30 seconds)
     * @returns Interval ID for stopping the collection
     */
    startLagMetricsCollection(intervalMs = 30000) {
        // Collect immediately on start
        this.collectAndRecordLagMetrics().catch(console.error);
        // Then collect periodically
        return setInterval(() => {
            this.collectAndRecordLagMetrics().catch(console.error);
        }, intervalMs);
    }
    /**
     * Disconnect from Redis (writer client)
     * Note: Reader connections are cleaned up automatically when their generators end
     */
    async disconnect() {
        if (this.writerClient) {
            await this.writerClient.quit();
            this.writerClient = null;
        }
    }
};
exports.RedisStreamsService = RedisStreamsService;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", MetricsService_1.MetricsService)
], RedisStreamsService.prototype, "metricsService", void 0);
exports.RedisStreamsService = RedisStreamsService = __decorate([
    (0, di_1.Service)(),
    __metadata("design:paramtypes", [])
], RedisStreamsService);
//# sourceMappingURL=RedisStreamsService.js.map