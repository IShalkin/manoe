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

import { Middleware, Req, Res, Next, Context } from "@tsed/common";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface UserContext {
  userId: string;
  email?: string;
  role?: string;
}

// Extend Express Request to include user context
// This is a module augmentation, not a traditional namespace
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userContext?: UserContext;
    }
  }
}

interface SupabaseJwtPayload {
  sub: string; // user_id
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

@Middleware()
export class AuthMiddleware {
  // Paths that don't require authentication
  private readonly EXEMPT_PATHS = [
    "/health",
    "/api/health",
    "/metrics",
    "/ready",
    "/live",
    "/docs",
  ];

  /**
   * Extract user context from JWT token
   * 
   * Note: This middleware is optional - it extracts user context when available
   * but doesn't block requests without it. Individual controllers can decide
   * whether to require authentication.
   */
  async use(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
    @Context() _ctx: Context
  ): Promise<void> {
    // Skip auth extraction for exempt paths
    if (this.isExemptPath(req.path)) {
      next();
      return;
    }

    try {
      const userContext = this.extractUserContext(req);
      if (userContext) {
        req.userContext = userContext;
      }
    } catch (error) {
      // Log but don't block - let controllers decide if auth is required
      // Using console.debug for optional auth extraction (not a critical error)
      // eslint-disable-next-line no-console
      console.debug("[AuthMiddleware] Failed to extract user context:", error instanceof Error ? error.message : "Unknown error");
    }

    next();
  }

  private isExemptPath(path: string): boolean {
    return this.EXEMPT_PATHS.some((exemptPath) => path.startsWith(exemptPath));
  }

  /**
   * Extract and verify user context from JWT token
   * Returns null if no token or verification fails
   */
  private extractUserContext(req: Request): UserContext | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!jwtSecret) {
      // eslint-disable-next-line no-console
      console.warn("[AuthMiddleware] SUPABASE_JWT_SECRET not configured - cannot verify JWT tokens");
      return null;
    }

    try {
      // Verify and decode JWT token
      const decoded = jwt.verify(token, jwtSecret) as SupabaseJwtPayload;

      return {
        userId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
    } catch (error) {
      // Invalid or expired token
      if (error instanceof jwt.JsonWebTokenError) {
        // eslint-disable-next-line no-console
        console.debug("[AuthMiddleware] Invalid JWT token:", error.message);
      } else if (error instanceof jwt.TokenExpiredError) {
        // eslint-disable-next-line no-console
        console.debug("[AuthMiddleware] Expired JWT token");
      }
      return null;
    }
  }

  /**
   * Helper function for controllers to require authentication
   * Throws an error if user is not authenticated
   */
  static requireAuth(req: Request): UserContext {
    if (!req.userContext) {
      throw new Error("Authentication required");
    }
    return req.userContext;
  }

  /**
   * Helper function for controllers to verify project ownership
   * Throws an error if user doesn't own the project
   */
  static verifyOwnership(req: Request, project: { user_id?: string }): void {
    const userContext = AuthMiddleware.requireAuth(req);
    
    if (!project.user_id) {
      throw new Error("Project does not have an owner");
    }

    if (project.user_id !== userContext.userId) {
      throw new Error("Access denied: You do not own this project");
    }
  }
}
