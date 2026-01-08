/**
 * Rate Limiting Middleware for MANOE
 * Protects API endpoints from abuse using Redis for distributed tracking
 * 
 * Features:
 * - Per-user rate limits (100 requests/minute default)
 * - Stricter limits for expensive operations (generation, repair)
 * - Atomic sliding window algorithm using Redis Lua script (prevents race conditions)
 * - Redis-based for distributed deployment support
 * - Fail-secure: rejects requests when rate limiting service is unavailable
 */

import { Middleware, Req, Res, Next, Context } from "@tsed/common";
import Redis from "ioredis";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
  keyPrefix: "manoe:ratelimit:",
};

const EXPENSIVE_OPERATIONS_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 10,
  keyPrefix: "manoe:ratelimit:expensive:",
};

const EXPENSIVE_PATHS = [
  "/orchestrate/start",
  "/orchestrate/generate",
  "/api/health/consistency",
  "/api/generation",
];

// Paths exempt from rate limiting (health checks, metrics)
const EXEMPT_PATHS = [
  "/health",
  "/api/health",
  "/metrics",
  "/ready",
  "/live",
];

const RATE_LIMIT_LUA_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local requestId = ARGV[4]
  
  redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
  local count = redis.call('ZCARD', key)
  
  if count >= limit then
    return -1
  end
  
  redis.call('ZADD', key, now, requestId)
  redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
  return limit - count - 1
`;

@Middleware()
export class RateLimitMiddleware {
  private client: Redis | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.connectionPromise = this.connect();
  }

  private async connect(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(redisUrl);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.isConnected = false;
        console.error("[RateLimitMiddleware] Redis connection timeout after 5 seconds");
        resolve(); // Don't reject - allow app to start, but rate limiting will fail-secure
      }, 5000);

      this.client!.on("error", (err) => {
        console.error("[RateLimitMiddleware] Redis connection error:", err);
        this.isConnected = false;
      });

      this.client!.on("connect", () => {
        clearTimeout(timeout);
        this.isConnected = true;
        console.log("[RateLimitMiddleware] Redis connected");
        resolve();
      });

      this.client!.on("close", () => {
        this.isConnected = false;
        console.warn("[RateLimitMiddleware] Redis connection closed");
      });

      this.client!.on("reconnecting", () => {
        console.log("[RateLimitMiddleware] Redis reconnecting...");
      });
    });
  }

  private getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new Error("Redis rate limit client not connected");
    }
    return this.client;
  }

  /**
   * Extract a rate limit identifier from the request.
   * 
   * SECURITY NOTE: We intentionally do NOT parse JWT payloads here because:
   * 1. JWT signature verification requires the secret key
   * 2. Parsing without verification allows attackers to forge tokens
   * 3. An attacker could exhaust another user's rate limit by forging their user ID
   * 
   * Instead, we use a hash of the entire token as the identifier. This ensures:
   * - Legitimate users with valid tokens get consistent rate limiting
   * - Attackers with forged tokens get their own rate limit bucket (not affecting others)
   * - No JWT secret needed in the rate limiter
   */
  private extractUserId(req: Request): string {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      // Use a hash of the token to identify the user without trusting the payload
      // This prevents attackers from forging tokens to exhaust other users' rate limits
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex").substring(0, 16);
      return `token:${tokenHash}`;
    }

    const apiKey = req.headers["x-api-key"];
    if (apiKey && typeof apiKey === "string") {
      // Hash the API key to avoid exposing it in logs/metrics
      const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex").substring(0, 16);
      return `apikey:${keyHash}`;
    }

    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string" 
      ? forwarded.split(",")[0].trim() 
      : req.ip || req.socket.remoteAddress || "unknown";

    return `ip:${ip}`;
  }

  private isExpensiveOperation(path: string): boolean {
    return EXPENSIVE_PATHS.some((expensivePath) => path.startsWith(expensivePath));
  }

  private getConfig(path: string): RateLimitConfig {
    return this.isExpensiveOperation(path) ? EXPENSIVE_OPERATIONS_CONFIG : DEFAULT_CONFIG;
  }

  private isExemptPath(path: string): boolean {
    return EXEMPT_PATHS.some((exemptPath) => path.startsWith(exemptPath));
  }

  async use(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
    @Context() ctx: Context
  ): Promise<void> {
    // Skip rate limiting for health check endpoints
    if (this.isExemptPath(req.path)) {
      next();
      return;
    }

    try {
      // Wait for initial connection if still pending
      if (this.connectionPromise) {
        await this.connectionPromise;
        this.connectionPromise = null;
      }

      const client = this.getClient();
      const userId = this.extractUserId(req);
      const config = this.getConfig(req.path);
      const key = `${config.keyPrefix}${userId}`;
      const now = Date.now();
      const requestId = `${now}-${Math.random().toString(36).substring(2, 9)}`;

      // Use atomic Lua script to prevent race conditions
      const remaining = await client.eval(
        RATE_LIMIT_LUA_SCRIPT,
        1,
        key,
        now.toString(),
        config.windowMs.toString(),
        config.maxRequests.toString(),
        requestId
      ) as number;

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, remaining));
      res.setHeader("X-RateLimit-Reset", Math.ceil((now + config.windowMs) / 1000));

      if (remaining < 0) {
        // Rate limit exceeded
        const retryAfterSeconds = Math.ceil(config.windowMs / 1000);
        res.setHeader("Retry-After", retryAfterSeconds);

        res.status(429).json({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Please try again in ${retryAfterSeconds} seconds.`,
          limit: config.maxRequests,
          windowMs: config.windowMs,
          retryAfter: Math.ceil((now + config.windowMs) / 1000),
        });
        return;
      }

      next();
    } catch (error) {
      // Fail-secure: reject requests when rate limiting fails
      console.error("[RateLimitMiddleware] CRITICAL: Rate limiting failure:", error);
      res.setHeader("X-RateLimit-Status", "service-unavailable");
      res.status(503).json({
        error: "Service Temporarily Unavailable",
        message: "Rate limiting service is unavailable. Please try again later.",
      });
      return;
    }
  }

  async getRateLimitInfo(userId: string, path: string): Promise<RateLimitInfo> {
    try {
      const client = this.getClient();
      const config = this.getConfig(path);
      const key = `${config.keyPrefix}${userId}`;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      await client.zremrangebyscore(key, 0, windowStart);
      const requestCount = await client.zcard(key);

      return {
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - requestCount),
        resetTime: Math.ceil((now + config.windowMs) / 1000),
      };
    } catch (error) {
      console.error("[RateLimitMiddleware] Error getting rate limit info:", error);
      return {
        limit: DEFAULT_CONFIG.maxRequests,
        remaining: DEFAULT_CONFIG.maxRequests,
        resetTime: Math.ceil((Date.now() + DEFAULT_CONFIG.windowMs) / 1000),
      };
    }
  }

  async resetUserLimit(userId: string): Promise<void> {
    try {
      const client = this.getClient();
      await client.del(`${DEFAULT_CONFIG.keyPrefix}${userId}`);
      await client.del(`${EXPENSIVE_OPERATIONS_CONFIG.keyPrefix}${userId}`);
    } catch (error) {
      console.error("[RateLimitMiddleware] Error resetting user limit:", error);
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
    }
  }
}

export function createRateLimitMiddleware(): RateLimitMiddleware {
  return new RateLimitMiddleware();
}
