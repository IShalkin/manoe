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
/**
 * Event structure for Redis Streams
 */
export interface StreamEvent {
    id: string;
    type: string;
    runId: string;
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
export declare class RedisStreamsService {
    private writerClient;
    private redisUrl;
    private get client();
    private readonly STREAM_EVENTS;
    private readonly STREAM_GLOBAL;
    private readonly CONSUMER_GROUP;
    constructor();
    /**
     * Establish connection to Redis (writer client only)
     * Reader connections are created per-stream to avoid head-of-line blocking
     */
    private connect;
    /**
     * Get the writer Redis client (for XADD, XRANGE, etc.)
     * This client is never blocked by XREAD operations
     */
    private getClient;
    /**
     * Create a dedicated reader connection for streaming
     * Each SSE connection gets its own reader to avoid blocking other operations
     */
    private createReaderConnection;
    /**
     * Get the stream key for a specific run
     */
    private getStreamKey;
    /**
     * Publish an event to a run-specific stream
     *
     * @param runId - Unique identifier for the generation run
     * @param eventType - Type of event (e.g., "phase_start", "agent_complete")
     * @param data - Event data payload
     * @param maxlen - Maximum stream length (older events are trimmed)
     * @returns The stream entry ID
     */
    publishEvent(runId: string, eventType: string, data: Record<string, unknown>, maxlen?: number): Promise<string>;
    /**
     * Get events from a run-specific stream
     *
     * @param runId - Unique identifier for the generation run
     * @param startId - Start reading from this ID (exclusive)
     * @param count - Maximum number of events to return
     * @returns List of events with their IDs
     */
    getEvents(runId: string, startId?: string, count?: number): Promise<StreamEvent[]>;
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
    streamEvents(runId: string, startId?: string, blockMs?: number): AsyncGenerator<StreamEvent, void, unknown>;
    /**
     * Create a consumer group for a stream
     *
     * @param runId - Unique identifier for the generation run
     * @param groupName - Consumer group name (defaults to CONSUMER_GROUP)
     * @returns True if created, False if already exists
     */
    createConsumerGroup(runId: string, groupName?: string): Promise<boolean>;
    /**
     * Get information about a stream
     *
     * @param runId - Unique identifier for the generation run
     * @returns Stream information including length, groups, etc.
     */
    getStreamInfo(runId: string): Promise<StreamInfo>;
    /**
     * Delete a stream and all its data
     *
     * @param runId - Unique identifier for the generation run
     * @returns True if deleted
     */
    deleteStream(runId: string): Promise<boolean>;
    /**
     * Trim a stream to a maximum length
     *
     * @param runId - Unique identifier for the generation run
     * @param maxlen - Maximum number of entries to keep
     * @returns Number of entries removed
     */
    trimStream(runId: string, maxlen?: number): Promise<number>;
    /**
     * Check if a run exists (has events)
     */
    runExists(runId: string): Promise<boolean>;
    /**
     * Get the last event for a run
     */
    getLastEvent(runId: string): Promise<StreamEvent | null>;
    /**
     * Parse a stream entry into a StreamEvent
     */
    private parseStreamEntry;
    /**
     * Parse XINFO response into an object
     */
    private parseXInfoResponse;
    /**
     * Sleep helper
     */
    private sleep;
    /**
     * Disconnect from Redis (writer client)
     * Note: Reader connections are cleaned up automatically when their generators end
     */
    disconnect(): Promise<void>;
}
//# sourceMappingURL=RedisStreamsService.d.ts.map