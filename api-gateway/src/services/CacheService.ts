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

import { Service } from "@tsed/di";
import Redis from "ioredis";

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

export class CacheError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "CacheError";
  }
}

@Service()
export class CacheService {
  private client: Redis | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private stats = { hits: 0, misses: 0, errors: 0 };

  private readonly DEFAULT_TTL = 300;
  private readonly KEY_PREFIX = "manoe:cache:";

  private readonly TTL_CONFIG = {
    project: 300,
    characters: 300,
    worldbuilding: 300,
    narrative: 600,
    outline: 300,
  };

  constructor() {
    this.connectionPromise = this.connect();
  }

  private async connect(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(redisUrl);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.isConnected = false;
        console.warn("[CacheService] Redis connection timeout - caching disabled");
        resolve();
      }, 5000);

      this.client!.on("error", (err) => {
        console.error("[CacheService] Redis connection error:", err);
        this.isConnected = false;
      });

      this.client!.on("connect", () => {
        clearTimeout(timeout);
        this.isConnected = true;
        console.log("[CacheService] Redis connected");
        resolve();
      });

      this.client!.on("close", () => {
        this.isConnected = false;
        console.warn("[CacheService] Redis connection closed");
      });

      this.client!.on("reconnecting", () => {
        console.log("[CacheService] Redis reconnecting...");
      });
    });
  }

  private getClient(): Redis | null {
    if (!this.client || !this.isConnected) {
      return null;
    }
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  private buildKey(type: string, id: string): string {
    return `${this.KEY_PREFIX}${type}:${id}`;
  }

  async get<T>(type: string, id: string): Promise<T | null> {
    try {
      const client = this.getClient();
      if (!client) {
        this.stats.misses++;
        return null;
      }

      const key = this.buildKey(type, id);
      const data = await client.get(key);

      if (data) {
        this.stats.hits++;
        return JSON.parse(data) as T;
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      console.error("[CacheService] Error getting cache:", error);
      this.stats.errors++;
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(
    type: string,
    id: string,
    data: T,
    ttlSeconds?: number
  ): Promise<void> {
    try {
      const client = this.getClient();
      if (!client) return;

      const key = this.buildKey(type, id);
      const ttl = ttlSeconds ?? this.TTL_CONFIG[type as keyof typeof this.TTL_CONFIG] ?? this.DEFAULT_TTL;

      await client.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      console.error("[CacheService] Error setting cache:", error);
      this.stats.errors++;
    }
  }

  async invalidate(type: string, id: string): Promise<void> {
    try {
      const client = this.getClient();
      if (!client) return;

      const key = this.buildKey(type, id);
      await client.del(key);
    } catch (error) {
      console.error("[CacheService] Error invalidating cache:", error);
      this.stats.errors++;
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const client = this.getClient();
      if (!client) return 0;

      const fullPattern = `${this.KEY_PREFIX}${pattern}`;
      let cursor = "0";
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          "MATCH",
          fullPattern,
          "COUNT",
          100
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          await client.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== "0");

      return deletedCount;
    } catch (error) {
      console.error("[CacheService] Error invalidating pattern:", error);
      this.stats.errors++;
      return 0;
    }
  }

  async invalidateProject(projectId: string): Promise<void> {
    await Promise.all([
      this.invalidate("project", projectId),
      this.invalidate("characters", projectId),
      this.invalidate("worldbuilding", projectId),
      this.invalidate("narrative", projectId),
      this.invalidate("outline", projectId),
    ]);
  }

  async getProject<T>(projectId: string): Promise<T | null> {
    return this.get<T>("project", projectId);
  }

  async setProject<T>(projectId: string, data: T): Promise<void> {
    await this.set("project", projectId, data, this.TTL_CONFIG.project);
  }

  async getCharacters<T>(projectId: string): Promise<T | null> {
    return this.get<T>("characters", projectId);
  }

  async setCharacters<T>(projectId: string, data: T): Promise<void> {
    await this.set("characters", projectId, data, this.TTL_CONFIG.characters);
  }

  async invalidateCharacters(projectId: string): Promise<void> {
    await this.invalidate("characters", projectId);
  }

  async getWorldbuilding<T>(projectId: string): Promise<T | null> {
    return this.get<T>("worldbuilding", projectId);
  }

  async setWorldbuilding<T>(projectId: string, data: T): Promise<void> {
    await this.set("worldbuilding", projectId, data, this.TTL_CONFIG.worldbuilding);
  }

  async invalidateWorldbuilding(projectId: string): Promise<void> {
    await this.invalidate("worldbuilding", projectId);
  }

  async getNarrative<T>(projectId: string): Promise<T | null> {
    return this.get<T>("narrative", projectId);
  }

  async setNarrative<T>(projectId: string, data: T): Promise<void> {
    await this.set("narrative", projectId, data, this.TTL_CONFIG.narrative);
  }

  async invalidateNarrative(projectId: string): Promise<void> {
    await this.invalidate("narrative", projectId);
  }

  async getOutline<T>(projectId: string): Promise<T | null> {
    return this.get<T>("outline", projectId);
  }

  async setOutline<T>(projectId: string, data: T): Promise<void> {
    await this.set("outline", projectId, data, this.TTL_CONFIG.outline);
  }

  async invalidateOutline(projectId: string): Promise<void> {
    await this.invalidate("outline", projectId);
  }

  /**
   * Get a value from cache, or fetch and cache it if not present.
   * 
   * This method properly handles null/undefined values by using a wrapper object
   * to distinguish between "cached null" and "cache miss". This prevents repeated
   * database queries for non-existent resources.
   */
  async getOrSet<T>(
    type: string,
    id: string,
    fetchFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Use a wrapper key to store metadata about the cached value
    const wrapperKey = `${type}:wrapped`;
    const cached = await this.get<{ exists: boolean; value: T | null }>(wrapperKey, id);
    
    if (cached !== null) {
      // We have a cached entry - return the value (which may be null for non-existent resources)
      return cached.value as T;
    }

    // Cache miss - fetch the data
    const data = await fetchFn();
    
    // Cache the result with a wrapper to handle null values
    // This ensures we don't repeatedly query for non-existent resources
    await this.set(wrapperKey, id, { exists: data !== null && data !== undefined, value: data }, ttlSeconds);
    return data;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      errors: this.stats.errors,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, errors: 0 };
  }

  async healthCheck(): Promise<{ status: string; latencyMs: number }> {
    try {
      const client = this.getClient();
      if (!client) {
        return { status: "unhealthy", latencyMs: -1 };
      }

      const start = Date.now();
      await client.ping();
      const latencyMs = Date.now() - start;

      return { status: "healthy", latencyMs };
    } catch (error) {
      return { status: "unhealthy", latencyMs: -1 };
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
