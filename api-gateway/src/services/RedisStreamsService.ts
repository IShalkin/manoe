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

import { Service, Inject } from "@tsed/di";
import Redis from "ioredis";
import { MetricsService } from "./MetricsService";

/**
 * Event structure for Redis Streams
 */
export interface StreamEvent {
  id: string;
  type: string;
  runId: string;
  eventId: string;  // Unique event ID for frontend deduplication
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Stream information
 */
export interface StreamInfo {
  length: number;
  firstEntry?: unknown;
  lastEntry?: unknown;
  groups?: number;
  exists: boolean;
}

/**
 * Consumer group information for lag monitoring
 */
export interface ConsumerGroupInfo {
  name: string;
  consumers: number;
  pending: number;
  lastDeliveredId: string;
  lag?: number;
}

/**
 * Stream lag metrics for monitoring
 */
export interface StreamLagMetrics {
  streamKey: string;
  length: number;
  groups: ConsumerGroupInfo[];
  totalLag: number;
  oldestPendingMs?: number;
}

@Service()
export class RedisStreamsService {
  // Dedicated writer client - never blocked by XREAD
  private writerClient: Redis | null = null;
  
  // Redis URL for creating reader connections
  private redisUrl: string = "";

  @Inject()
  private metricsService!: MetricsService;
  
  // Legacy alias for backward compatibility
  private get client(): Redis | null {
    return this.writerClient;
  }

  // Stream name templates
  private readonly STREAM_EVENTS = "manoe:events:{runId}";
  private readonly STREAM_GLOBAL = "manoe:events:global";

  // Consumer group
  private readonly CONSUMER_GROUP = "manoe-consumers";

  constructor() {
    this.connect();
  }

  /**
   * Establish connection to Redis (writer client only)
   * Reader connections are created per-stream to avoid head-of-line blocking
   */
  private connect(): void {
    this.redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.writerClient = new Redis(this.redisUrl);

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
  private getClient(): Redis {
    if (!this.writerClient) {
      throw new Error("Redis writer client not initialized");
    }
    return this.writerClient;
  }
  
  /**
   * Create a dedicated reader connection for streaming
   * Each SSE connection gets its own reader to avoid blocking other operations
   */
  private createReaderConnection(): Redis {
    const reader = new Redis(this.redisUrl);
    reader.on("error", (err) => {
      console.error("Redis Streams reader connection error:", err);
    });
    return reader;
  }

  /**
   * Get the stream key for a specific run
   */
  private getStreamKey(runId: string): string {
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
  async publishEvent(
    runId: string,
    eventType: string,
    data: Record<string, unknown>,
    maxlen: number = 1000
  ): Promise<string> {
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
    const entryId = await client.xadd(
      streamKey,
      "MAXLEN",
      "~",
      maxlen.toString(),
      "*",
      ...Object.entries(event).flat()
    );

    // Also add to global stream for monitoring
    await client.xadd(
      this.STREAM_GLOBAL,
      "MAXLEN",
      "~",
      (maxlen * 10).toString(),
      "*",
      ...Object.entries(event).flat()
    );

    // Record Redis stream metrics after publishing
    try {
      const streamInfo = await this.getStreamInfo(runId);
      this.metricsService.recordRedisStreamMetrics({
        streamKey,
        length: streamInfo.length,
      });
    } catch (metricsError) {
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
  async getEvents(
    runId: string,
    startId: string = "0",
    count: number = 100
  ): Promise<StreamEvent[]> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    try {
      const entries = await client.xrange(
        streamKey,
        startId === "0" ? "-" : `(${startId}`,
        "+",
        "COUNT",
        count.toString()
      );

      return entries.map(([id, fields]) => this.parseStreamEntry(id, fields));
    } catch (error) {
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
  async *streamEvents(
    runId: string,
    startId: string = "$",
    blockMs: number = 5000
  ): AsyncGenerator<StreamEvent, void, unknown> {
    // Create a dedicated reader connection for this stream
    // This prevents XREAD BLOCK from blocking XADD operations on the writer
    const readerClient = this.createReaderConnection();
    const streamKey = this.getStreamKey(runId);
    let lastId = startId;

    try {
      while (true) {
        try {
          const entries = await readerClient.call(
            "XREAD",
            "BLOCK",
            blockMs.toString(),
            "COUNT",
            "10",
            "STREAMS",
            streamKey,
            lastId
          ) as Array<[string, Array<[string, string[]]>]> | null;

          if (entries && entries.length > 0) {
            for (const [, streamEntries] of entries) {
              for (const [entryId, fields] of streamEntries) {
                lastId = entryId;
                yield this.parseStreamEntry(entryId, fields);
              }
            }
          } else {
            // No new events, yield heartbeat
            yield {
              id: "heartbeat",
              type: "heartbeat",
              runId: runId,
              eventId: `heartbeat-${Date.now()}`,  // Unique eventId for heartbeat
              timestamp: new Date().toISOString(),
              data: {},
            };
          }
        } catch (error) {
          if ((error as Error).message?.includes("NOGROUP")) {
            break;
          }
          // Log error and yield error event
          yield {
            id: "error",
            type: "error",
            runId: runId,
            eventId: `error-${Date.now()}`,  // Unique eventId for error
            timestamp: new Date().toISOString(),
            data: { error: String(error) },
          };
          await this.sleep(1000);
        }
      }
    } finally {
      // Clean up the dedicated reader connection when the generator ends
      // This happens when the SSE connection closes or the generator is stopped
      try {
        await readerClient.quit();
      } catch (e) {
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
  async createConsumerGroup(
    runId: string,
    groupName?: string
  ): Promise<boolean> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);
    const group = groupName ?? this.CONSUMER_GROUP;

    try {
      await client.xgroup("CREATE", streamKey, group, "0", "MKSTREAM");
      return true;
    } catch (error) {
      if ((error as Error).message?.includes("BUSYGROUP")) {
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
  async getStreamInfo(runId: string): Promise<StreamInfo> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    try {
      const info = await client.xinfo("STREAM", streamKey) as unknown[];
      const infoObj = this.parseXInfoResponse(info);
      
      return {
        length: typeof infoObj.length === "number" ? infoObj.length : 0,
        firstEntry: infoObj["first-entry"],
        lastEntry: infoObj["last-entry"],
        groups: typeof infoObj.groups === "number" ? infoObj.groups : 0,
        exists: true,
      };
    } catch (error) {
      return { length: 0, exists: false };
    }
  }

  /**
   * Delete a stream and all its data
   * 
   * @param runId - Unique identifier for the generation run
   * @returns True if deleted
   */
  async deleteStream(runId: string): Promise<boolean> {
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
  async trimStream(runId: string, maxlen: number = 1000): Promise<number> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);
    return await client.xtrim(streamKey, "MAXLEN", "~", maxlen);
  }

  /**
   * Check if a run exists (has events)
   */
  async runExists(runId: string): Promise<boolean> {
    const info = await this.getStreamInfo(runId);
    return info.exists && info.length > 0;
  }

  /**
   * Get the last event for a run
   */
  async getLastEvent(runId: string): Promise<StreamEvent | null> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    try {
      const entries = await client.xrevrange(streamKey, "+", "-", "COUNT", "1");
      if (entries.length > 0) {
        const [id, fields] = entries[0];
        return this.parseStreamEntry(id, fields);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse a stream entry into a StreamEvent
   */
  private parseStreamEntry(id: string, fields: string[]): StreamEvent {
    const fieldMap: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      fieldMap[fields[i]] = fields[i + 1];
    }

    return {
      id,
      type: fieldMap.type ?? "unknown",
      runId: fieldMap.runId ?? "",
      eventId: fieldMap.eventId ?? id,  // Fall back to stream entry ID if eventId not present
      timestamp: fieldMap.timestamp ?? new Date().toISOString(),
      data: fieldMap.data ? JSON.parse(fieldMap.data) : {},
    };
  }

  /**
   * Parse XINFO response into an object
   */
  private parseXInfoResponse(info: unknown[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < info.length; i += 2) {
      result[String(info[i])] = info[i + 1];
    }
    return result;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
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
  async getConsumerGroups(runId: string): Promise<ConsumerGroupInfo[]> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    try {
      const groups = await client.xinfo("GROUPS", streamKey) as unknown[][];
      
      return groups.map((group) => {
        const groupObj = this.parseXInfoResponse(group as unknown[]);
        return {
          name: String(groupObj.name || ""),
          consumers: typeof groupObj.consumers === "number" ? groupObj.consumers : 0,
          pending: typeof groupObj.pending === "number" ? groupObj.pending : 0,
          lastDeliveredId: String(groupObj["last-delivered-id"] || "0-0"),
          lag: typeof groupObj.lag === "number" ? groupObj.lag : undefined,
        };
      });
    } catch (error) {
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
  async getStreamLagMetrics(runId: string): Promise<StreamLagMetrics> {
    const streamKey = this.getStreamKey(runId);
    const streamInfo = await this.getStreamInfo(runId);
    const groups = await this.getConsumerGroups(runId);

    // Calculate total lag across all consumer groups
    let totalLag = 0;
    for (const group of groups) {
      if (group.lag !== undefined) {
        totalLag += group.lag;
      } else {
        // Estimate lag from pending count if lag not available
        totalLag += group.pending;
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
   * Get lag metrics for the global events stream
   * Used for overall system health monitoring
   * 
   * @returns Stream lag metrics for the global stream
   */
  async getGlobalStreamLagMetrics(): Promise<StreamLagMetrics> {
    const client = this.getClient();
    const streamKey = this.STREAM_GLOBAL;

    try {
      const info = await client.xinfo("STREAM", streamKey) as unknown[];
      const infoObj = this.parseXInfoResponse(info);
      
      let groups: ConsumerGroupInfo[] = [];
      try {
        const groupsRaw = await client.xinfo("GROUPS", streamKey) as unknown[][];
        groups = groupsRaw.map((group) => {
          const groupObj = this.parseXInfoResponse(group as unknown[]);
          return {
            name: String(groupObj.name || ""),
            consumers: typeof groupObj.consumers === "number" ? groupObj.consumers : 0,
            pending: typeof groupObj.pending === "number" ? groupObj.pending : 0,
            lastDeliveredId: String(groupObj["last-delivered-id"] || "0-0"),
            lag: typeof groupObj.lag === "number" ? groupObj.lag : undefined,
          };
        });
      } catch {
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
    } catch (error) {
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
  async getActiveStreamKeys(): Promise<string[]> {
    const client = this.getClient();
    const pattern = "manoe:events:*";
    const keys: string[] = [];
    
    let cursor = "0";
    do {
      const [nextCursor, foundKeys] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        "100"
      );
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
  async getAllStreamLagMetrics(): Promise<Map<string, StreamLagMetrics>> {
    const metrics = new Map<string, StreamLagMetrics>();
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
  async checkLagThreshold(threshold: number = 1000): Promise<Array<{ streamKey: string; lag: number }>> {
    const allMetrics = await this.getAllStreamLagMetrics();
    const exceeding: Array<{ streamKey: string; lag: number }> = [];

    for (const [streamKey, metrics] of allMetrics) {
      if (metrics.totalLag > threshold) {
        exceeding.push({ streamKey, lag: metrics.totalLag });
      }
    }

    return exceeding;
  }

  /**
   * Disconnect from Redis (writer client)
   * Note: Reader connections are cleaned up automatically when their generators end
   */
  async disconnect(): Promise<void> {
    if (this.writerClient) {
      await this.writerClient.quit();
      this.writerClient = null;
    }
  }
}
