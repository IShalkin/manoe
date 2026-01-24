"use strict";
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
exports.CacheService = exports.CacheError = void 0;
const di_1 = require("@tsed/di");
const ioredis_1 = __importDefault(require("ioredis"));
class CacheError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "CacheError";
    }
}
exports.CacheError = CacheError;
let CacheService = class CacheService {
    client = null;
    isConnected = false;
    connectionPromise = null;
    stats = { hits: 0, misses: 0, errors: 0 };
    DEFAULT_TTL = 300;
    KEY_PREFIX = "manoe:cache:";
    TTL_CONFIG = {
        project: 300,
        characters: 300,
        worldbuilding: 300,
        narrative: 600,
        outline: 300,
    };
    constructor() {
        this.connectionPromise = this.connect();
    }
    async connect() {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.client = new ioredis_1.default(redisUrl);
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.isConnected = false;
                console.warn("[CacheService] Redis connection timeout - caching disabled");
                resolve();
            }, 5000);
            this.client.on("error", (err) => {
                console.error("[CacheService] Redis connection error:", err);
                this.isConnected = false;
            });
            this.client.on("connect", () => {
                clearTimeout(timeout);
                this.isConnected = true;
                console.log("[CacheService] Redis connected");
                resolve();
            });
            this.client.on("close", () => {
                this.isConnected = false;
                console.warn("[CacheService] Redis connection closed");
            });
            this.client.on("reconnecting", () => {
                console.log("[CacheService] Redis reconnecting...");
            });
        });
    }
    getClient() {
        if (!this.client || !this.isConnected) {
            return null;
        }
        return this.client;
    }
    isHealthy() {
        return this.isConnected;
    }
    buildKey(type, id) {
        return `${this.KEY_PREFIX}${type}:${id}`;
    }
    async get(type, id) {
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
                return JSON.parse(data);
            }
            this.stats.misses++;
            return null;
        }
        catch (error) {
            console.error("[CacheService] Error getting cache:", error);
            this.stats.errors++;
            this.stats.misses++;
            return null;
        }
    }
    async set(type, id, data, ttlSeconds) {
        try {
            const client = this.getClient();
            if (!client)
                return;
            const key = this.buildKey(type, id);
            const ttl = ttlSeconds ?? this.TTL_CONFIG[type] ?? this.DEFAULT_TTL;
            await client.setex(key, ttl, JSON.stringify(data));
        }
        catch (error) {
            console.error("[CacheService] Error setting cache:", error);
            this.stats.errors++;
        }
    }
    async invalidate(type, id) {
        try {
            const client = this.getClient();
            if (!client)
                return;
            const key = this.buildKey(type, id);
            await client.del(key);
        }
        catch (error) {
            console.error("[CacheService] Error invalidating cache:", error);
            this.stats.errors++;
        }
    }
    async invalidatePattern(pattern) {
        try {
            const client = this.getClient();
            if (!client)
                return 0;
            const fullPattern = `${this.KEY_PREFIX}${pattern}`;
            let cursor = "0";
            let deletedCount = 0;
            do {
                const [nextCursor, keys] = await client.scan(cursor, "MATCH", fullPattern, "COUNT", 100);
                cursor = nextCursor;
                if (keys.length > 0) {
                    await client.del(...keys);
                    deletedCount += keys.length;
                }
            } while (cursor !== "0");
            return deletedCount;
        }
        catch (error) {
            console.error("[CacheService] Error invalidating pattern:", error);
            this.stats.errors++;
            return 0;
        }
    }
    async invalidateProject(projectId) {
        await Promise.all([
            this.invalidate("project", projectId),
            this.invalidate("characters", projectId),
            this.invalidate("worldbuilding", projectId),
            this.invalidate("narrative", projectId),
            this.invalidate("outline", projectId),
        ]);
    }
    async getProject(projectId) {
        return this.get("project", projectId);
    }
    async setProject(projectId, data) {
        await this.set("project", projectId, data, this.TTL_CONFIG.project);
    }
    async getCharacters(projectId) {
        return this.get("characters", projectId);
    }
    async setCharacters(projectId, data) {
        await this.set("characters", projectId, data, this.TTL_CONFIG.characters);
    }
    async invalidateCharacters(projectId) {
        await this.invalidate("characters", projectId);
    }
    async getWorldbuilding(projectId) {
        return this.get("worldbuilding", projectId);
    }
    async setWorldbuilding(projectId, data) {
        await this.set("worldbuilding", projectId, data, this.TTL_CONFIG.worldbuilding);
    }
    async invalidateWorldbuilding(projectId) {
        await this.invalidate("worldbuilding", projectId);
    }
    async getNarrative(projectId) {
        return this.get("narrative", projectId);
    }
    async setNarrative(projectId, data) {
        await this.set("narrative", projectId, data, this.TTL_CONFIG.narrative);
    }
    async invalidateNarrative(projectId) {
        await this.invalidate("narrative", projectId);
    }
    async getOutline(projectId) {
        return this.get("outline", projectId);
    }
    async setOutline(projectId, data) {
        await this.set("outline", projectId, data, this.TTL_CONFIG.outline);
    }
    async invalidateOutline(projectId) {
        await this.invalidate("outline", projectId);
    }
    /**
     * Get a value from cache, or fetch and cache it if not present.
     *
     * This method properly handles null/undefined values by using a wrapper object
     * to distinguish between "cached null" and "cache miss". This prevents repeated
     * database queries for non-existent resources.
     */
    async getOrSet(type, id, fetchFn, ttlSeconds) {
        const client = this.getClient();
        if (!client) {
            return await fetchFn();
        }
        const key = this.buildKey(type, id);
        const cachedRaw = await client.get(key);
        if (cachedRaw !== null) {
            if (cachedRaw === "__NULL__")
                return null;
            return JSON.parse(cachedRaw);
        }
        const data = await fetchFn();
        const ttl = ttlSeconds ?? this.TTL_CONFIG[type] ?? this.DEFAULT_TTL;
        await client.setex(key, ttl, data === null || data === undefined ? "__NULL__" : JSON.stringify(data));
        return data;
    }
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: total > 0 ? this.stats.hits / total : 0,
            errors: this.stats.errors,
        };
    }
    resetStats() {
        this.stats = { hits: 0, misses: 0, errors: 0 };
    }
    async healthCheck() {
        try {
            const client = this.getClient();
            if (!client) {
                return { status: "unhealthy", latencyMs: -1 };
            }
            const start = Date.now();
            await client.ping();
            const latencyMs = Date.now() - start;
            return { status: "healthy", latencyMs };
        }
        catch (error) {
            return { status: "unhealthy", latencyMs: -1 };
        }
    }
    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.client = null;
        }
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = __decorate([
    (0, di_1.Service)(),
    __metadata("design:paramtypes", [])
], CacheService);
//# sourceMappingURL=CacheService.js.map