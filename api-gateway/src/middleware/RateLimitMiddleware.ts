/**
 * Rate Limiting Middleware for MANOE
 * Protects API endpoints from abuse using Redis for distributed tracking
 * 
 * Features:
 * - Per-user rate limits (100 requests/minute default)
 * - Stricter limits for expensive operations (generation, repair)
 * - Sliding window algorithm for accurate rate limiting
 * - Redis-based for distributed deployment support
 */

import { Middleware, Req, Res, Next, Context } from "@tsed/common";
import { Inject } from "@tsed/di";
import Redis from "ioredis";
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

@Middleware()
export class RateLimitMiddleware {
  private client: Redis | null = null;

  constructor() {
    this.connect();
  }

  private connect(): void {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(redisUrl);

    this.client.on("error", (err) => {
      console.error("[RateLimitMiddleware] Redis connection error:", err);
    });

    this.client.on("connect", () => {
      console.log("[RateLimitMiddleware] Redis connected");
    });
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error("Redis rate limit client not initialized");
    }
    return this.client;
  }

  private extractUserId(req: Request): string {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
        if (payload.sub) {
          return payload.sub;
        }
      } catch {
        // Fall through to IP-based identification
      }
    }

    const apiKey = req.headers["x-api-key"];
    if (apiKey && typeof apiKey === "string") {
      return `apikey:${apiKey.substring(0, 8)}`;
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

  async use(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
    @Context() ctx: Context
  ): Promise<void> {
    try {
      const client = this.getClient();
      const userId = this.extractUserId(req);
      const config = this.getConfig(req.path);
      const key = `${config.keyPrefix}${userId}`;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      await client.zremrangebyscore(key, 0, windowStart);

      const requestCount = await client.zcard(key);

      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxRequests - requestCount - 1));
      res.setHeader("X-RateLimit-Reset", Math.ceil((now + config.windowMs) / 1000));

      if (requestCount >= config.maxRequests) {
        const oldestRequest = await client.zrange(key, 0, 0, "WITHSCORES");
        const resetTime = oldestRequest.length >= 2 
          ? Math.ceil((parseInt(oldestRequest[1]) + config.windowMs) / 1000)
          : Math.ceil((now + config.windowMs) / 1000);

        res.setHeader("Retry-After", Math.ceil((resetTime * 1000 - now) / 1000));

        res.status(429).json({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Please try again in ${Math.ceil((resetTime * 1000 - now) / 1000)} seconds.`,
          limit: config.maxRequests,
          windowMs: config.windowMs,
          retryAfter: resetTime,
        });
        return;
      }

      const requestId = `${now}-${Math.random().toString(36).substring(2, 9)}`;
      await client.zadd(key, now.toString(), requestId);
      await client.expire(key, Math.ceil(config.windowMs / 1000) + 1);

      next();
    } catch (error) {
      console.error("[RateLimitMiddleware] Error:", error);
      next();
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

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}

export function createRateLimitMiddleware(): RateLimitMiddleware {
  return new RateLimitMiddleware();
}
