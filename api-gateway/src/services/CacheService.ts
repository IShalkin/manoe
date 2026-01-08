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
}

@Service()
export class CacheService {
  private client: Redis | null = null;
  private stats = { hits: 0, misses: 0 };

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
    this.connect();
  }

  private connect(): void {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(redisUrl);

    this.client.on("error", (err) => {
      console.error("[CacheService] Redis connection error:", err);
    });

    this.client.on("connect", () => {
      console.log("[CacheService] Redis connected");
    });
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error("Redis cache client not initialized");
    }
    return this.client;
  }

  private buildKey(type: string, id: string): string {
    return `${this.KEY_PREFIX}${type}:${id}`;
  }

  async get<T>(type: string, id: string): Promise<T | null> {
    try {
      const client = this.getClient();
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
      const key = this.buildKey(type, id);
      const ttl = ttlSeconds ?? this.TTL_CONFIG[type as keyof typeof this.TTL_CONFIG] ?? this.DEFAULT_TTL;

      await client.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      console.error("[CacheService] Error setting cache:", error);
    }
  }

  async invalidate(type: string, id: string): Promise<void> {
    try {
      const client = this.getClient();
      const key = this.buildKey(type, id);
      await client.del(key);
    } catch (error) {
      console.error("[CacheService] Error invalidating cache:", error);
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const client = this.getClient();
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

  async getOrSet<T>(
    type: string,
    id: string,
    fetchFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(type, id);
    if (cached !== null) {
      return cached;
    }

    const data = await fetchFn();
    await this.set(type, id, data, ttlSeconds);
    return data;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  async healthCheck(): Promise<{ status: string; latencyMs: number }> {
    try {
      const client = this.getClient();
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
