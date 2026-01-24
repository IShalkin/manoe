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
import { Context } from "@tsed/common";
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
export declare class RateLimitMiddleware {
    private client;
    private isConnected;
    private connectionPromise;
    constructor();
    private connect;
    private getClient;
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
    private extractUserId;
    private isExpensiveOperation;
    private getConfig;
    private isExemptPath;
    use(req: Request, res: Response, next: NextFunction, ctx: Context): Promise<void>;
    getRateLimitInfo(userId: string, path: string): Promise<RateLimitInfo>;
    resetUserLimit(userId: string): Promise<void>;
    isHealthy(): boolean;
    disconnect(): Promise<void>;
}
export declare function createRateLimitMiddleware(): RateLimitMiddleware;
//# sourceMappingURL=RateLimitMiddleware.d.ts.map