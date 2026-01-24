/**
 * Redis Cache Service for MANOE
 * Provides TTL-based caching for frequently accessed data to reduce database load
 *
 * Features:
 * - Project metadata caching (5-minute TTL)
 * - Character/worldbuilding entity caching per project
 * - Narrative possibility caching
 * - Cache invalidation on data updates
 * - Distributed caching via Redis
 * - Graceful degradation: cache failures don't break the application
 */
export interface CacheOptions {
    ttlSeconds?: number;
    prefix?: string;
}
export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    errors: number;
}
export declare class CacheError extends Error {
    readonly cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
export declare class CacheService {
    private client;
    private isConnected;
    private connectionPromise;
    private stats;
    private readonly DEFAULT_TTL;
    private readonly KEY_PREFIX;
    private readonly TTL_CONFIG;
    constructor();
    private connect;
    private getClient;
    isHealthy(): boolean;
    private buildKey;
    get<T>(type: string, id: string): Promise<T | null>;
    set<T>(type: string, id: string, data: T, ttlSeconds?: number): Promise<void>;
    invalidate(type: string, id: string): Promise<void>;
    invalidatePattern(pattern: string): Promise<number>;
    invalidateProject(projectId: string): Promise<void>;
    getProject<T>(projectId: string): Promise<T | null>;
    setProject<T>(projectId: string, data: T): Promise<void>;
    getCharacters<T>(projectId: string): Promise<T | null>;
    setCharacters<T>(projectId: string, data: T): Promise<void>;
    invalidateCharacters(projectId: string): Promise<void>;
    getWorldbuilding<T>(projectId: string): Promise<T | null>;
    setWorldbuilding<T>(projectId: string, data: T): Promise<void>;
    invalidateWorldbuilding(projectId: string): Promise<void>;
    getNarrative<T>(projectId: string): Promise<T | null>;
    setNarrative<T>(projectId: string, data: T): Promise<void>;
    invalidateNarrative(projectId: string): Promise<void>;
    getOutline<T>(projectId: string): Promise<T | null>;
    setOutline<T>(projectId: string, data: T): Promise<void>;
    invalidateOutline(projectId: string): Promise<void>;
    /**
     * Get a value from cache, or fetch and cache it if not present.
     *
     * This method properly handles null/undefined values by using a wrapper object
     * to distinguish between "cached null" and "cache miss". This prevents repeated
     * database queries for non-existent resources.
     */
    getOrSet<T>(type: string, id: string, fetchFn: () => Promise<T>, ttlSeconds?: number): Promise<T>;
    getStats(): CacheStats;
    resetStats(): void;
    healthCheck(): Promise<{
        status: string;
        latencyMs: number;
    }>;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=CacheService.d.ts.map