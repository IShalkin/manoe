/**
 * Authentication Middleware for MANOE
 * Extracts and validates user_id from Supabase JWT tokens
 *
 * Purpose:
 * - Defense-in-depth: Provides application-layer user verification
 * - Complements Supabase RLS (Row Level Security)
 * - Enables explicit user ownership checks in controllers
 *
 * Security:
 * - Verifies JWT signature using Supabase JWT secret
 * - Extracts user_id from verified token payload
 * - Stores user context in request for downstream use
 */
import { Context } from "@tsed/common";
import type { Request, Response, NextFunction } from "express";
export interface UserContext {
    userId: string;
    email?: string;
    role?: string;
}
declare global {
    namespace Express {
        interface Request {
            userContext?: UserContext;
        }
    }
}
export declare class AuthMiddleware {
    private readonly EXEMPT_PATHS;
    /**
     * Extract user context from JWT token
     *
     * Note: This middleware is optional - it extracts user context when available
     * but doesn't block requests without it. Individual controllers can decide
     * whether to require authentication.
     */
    use(req: Request, res: Response, next: NextFunction, ctx: Context): Promise<void>;
    private isExemptPath;
    /**
     * Extract and verify user context from JWT token
     * Returns null if no token or verification fails
     */
    private extractUserContext;
    /**
     * Helper function for controllers to require authentication
     * Throws an error if user is not authenticated
     */
    static requireAuth(req: Request): UserContext;
    /**
     * Helper function for controllers to verify project ownership
     * Throws an error if user doesn't own the project
     */
    static verifyOwnership(req: Request, project: {
        user_id?: string;
    }): void;
}
//# sourceMappingURL=AuthMiddleware.d.ts.map